const pool = require('../db/pool');
const { sendEmail } = require('./emailService');

/**
 * auctionCloser — runs on a fixed interval (default 60s).
 *
 * For every auction where:
 *   - ends_at has passed
 *   - is_live = true  (still marked as live)
 *   - status != 'ended'
 *
 * It will:
 *   1. Lock the auction row (FOR UPDATE)
 *   2. Find the highest bid
 *   3. Record the winner on the auction row
 *   4. Write a permanent auction_results record (with commission)
 *   5. Set status = 'ended', is_live = false, closed_at = NOW()
 *   6. Create in-app notifications for winner + seller
 *   7. Send winner email + seller email
 */

async function closeExpiredAuctions() {
  const client = await pool.connect();
  try {
    // Find all auctions that have expired but not yet been closed
    const expiredRes = await client.query(`
      SELECT a.id, a.title, a.starting_bid, a.current_bid, a.bid_count,
             a.seller_id, a.image_url, a.ends_at,
             u.email AS seller_email, u.full_name AS seller_name
      FROM auctions a
      JOIN users u ON a.seller_id = u.id
      WHERE a.ends_at <= NOW()
        AND a.is_live = true
        AND a.status != 'ended'
    `);

    if (expiredRes.rows.length === 0) return;

    console.log(`[AuctionCloser] Closing ${expiredRes.rows.length} expired auction(s)...`);

    // Get platform settings once
    const settingsRes = await client.query(
      `SELECT key, value FROM platform_settings WHERE key IN ('CommissionRate', 'MinNoBidWaitMinutes', 'BuyerPaymentPercent')`
    );
    const settingsMap = Object.fromEntries(settingsRes.rows.map((r) => [r.key, r.value]));
    const commissionRate = parseFloat(settingsMap['CommissionRate'] || '5');
    const minNoBidWaitMinutes = parseInt(settingsMap['MinNoBidWaitMinutes'] || '1440', 10);
    const buyerPaymentPercent = parseFloat(settingsMap['BuyerPaymentPercent'] || '80');

    for (const auction of expiredRes.rows) {
      // If no bids yet, wait the minimum no-bid period before closing
      if (auction.bid_count === 0) {
        const waitUntil = new Date(auction.ends_at).getTime() + minNoBidWaitMinutes * 60 * 1000;
        if (Date.now() < waitUntil) {
          console.log(`[AuctionCloser] Skipping auction #${auction.id} — no bids, waiting until ${new Date(waitUntil).toISOString()}`);
          continue;
        }
      }
      await closeAuction(client, auction, commissionRate, buyerPaymentPercent);
    }
  } catch (err) {
    console.error('[AuctionCloser] Error during close sweep:', err.message);
  } finally {
    client.release();
  }
}

async function closeAuction(client, auction, commissionRate, buyerPaymentPercent = 80) {
  try {
    await client.query('BEGIN');

    // Re-fetch with row lock to prevent race conditions
    const lockRes = await client.query(
      `SELECT * FROM auctions WHERE id = $1 AND status != 'ended' FOR UPDATE`,
      [auction.id]
    );
    if (lockRes.rows.length === 0) {
      // Another process already closed it
      await client.query('ROLLBACK');
      return;
    }

    // Find the highest bid
    const bidRes = await client.query(
      `SELECT b.amount, b.user_id, u.email, u.full_name
       FROM bids b
       JOIN users u ON b.user_id = u.id
       WHERE b.auction_item_id = $1
       ORDER BY b.amount DESC
       LIMIT 1`,
      [auction.id]
    );

    const hasWinner = bidRes.rows.length > 0;
    const winner = hasWinner ? bidRes.rows[0] : null;
    const winningBid = winner ? parseFloat(winner.amount) : 0;

    // ── Reserve price check ─────────────────────────────────────────────────
    const reservePrice = lockRes.rows[0].reserve_price != null
      ? parseFloat(lockRes.rows[0].reserve_price)
      : null;
    const reserveMet = reservePrice === null || winningBid >= reservePrice;
    const soldWithWinner = hasWinner && reserveMet;

    const commissionAmount = soldWithWinner
      ? Math.round(winningBid * (commissionRate / 100) * 100) / 100
      : 0;
    const sellerPayout = soldWithWinner
      ? Math.round((winningBid - commissionAmount) * 100) / 100
      : 0;
    // Buyer must pay 80% of final bid (BuyerPaymentPercent setting)
    const pct = Number.isFinite(buyerPaymentPercent) ? buyerPaymentPercent : 80;
    const amountDue = soldWithWinner
      ? Math.round(winningBid * (pct / 100) * 100) / 100
      : 0;

    // 1. Update the auction row
    await client.query(
      `UPDATE auctions
       SET status = 'ended',
           is_live = false,
           winner_id = $1,
           closed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [soldWithWinner ? winner?.user_id : null, auction.id]
    );

    // 2. Write the permanent auction_results record (with payment tracking)
    await client.query(
      `INSERT INTO auction_results
         (auction_id, winner_id, winning_bid, commission_rate, commission_amount, seller_payout,
          amount_due, amount_paid, payment_status, closed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, NOW())`,
      [
        auction.id,
        soldWithWinner ? winner?.user_id : null,
        winningBid,
        commissionRate,
        commissionAmount,
        sellerPayout,
        amountDue,
        soldWithWinner ? 'unpaid' : 'unpaid',
      ]
    );

    // 3. In-app notifications
    if (soldWithWinner) {
      // Notify the winner
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, auction_id)
         VALUES ($1, 'auction_won', $2, $3, $4)`,
        [
          winner.user_id,
          '🏆 You won an auction!',
          `Congratulations! You won "${auction.title}" with a bid of RWF ${winningBid.toLocaleString()}. Amount due (${pct}%): RWF ${amountDue.toLocaleString()}.`,
          auction.id,
        ]
      );
    } else if (hasWinner && !reserveMet) {
      // Notify the highest bidder that reserve was not met
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, auction_id)
         VALUES ($1, 'reserve_not_met', $2, $3, $4)`,
        [
          winner.user_id,
          '📋 Reserve Not Met',
          `The auction for "${auction.title}" ended but the reserve price was not reached. Your bid was not successful.`,
          auction.id,
        ]
      );
    }

    // Notify the seller
    let sellerNotifType, sellerNotifTitle, sellerMessage;
    if (soldWithWinner) {
      sellerNotifType = 'auction_sold';
      sellerNotifTitle = '✅ Auction Sold!';
      sellerMessage = `Your auction "${auction.title}" has ended. Winning bid: RWF ${winningBid.toLocaleString()}. Buyer must pay RWF ${amountDue.toLocaleString()} (${pct}%). Your payout: RWF ${sellerPayout.toLocaleString()} (after ${commissionRate}% commission).`;
    } else if (hasWinner && !reserveMet) {
      sellerNotifType = 'reserve_not_met';
      sellerNotifTitle = '📋 Reserve Not Met';
      sellerMessage = `Your auction "${auction.title}" ended with a highest bid of RWF ${winningBid.toLocaleString()}, which did not meet your reserve price. Consider relisting.`;
    } else {
      sellerNotifType = 'auction_no_sale';
      sellerNotifTitle = '📭 Auction Ended — No Bids';
      sellerMessage = `Your auction "${auction.title}" has ended with no bids. Consider relisting at a lower starting price.`;
    }

    await client.query(
      `INSERT INTO notifications (user_id, type, title, message, auction_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [auction.seller_id, sellerNotifType, sellerNotifTitle, sellerMessage, auction.id]
    );

    await client.query('COMMIT');

    console.log(
      `[AuctionCloser] Closed auction #${auction.id} "${auction.title}" — ` +
      (soldWithWinner
        ? `Winner: ${winner.full_name} @ RWF ${winningBid}, due RWF ${amountDue} (${pct}%)`
        : hasWinner
        ? `Reserve not met (highest bid: RWF ${winningBid})`
        : 'No bids')
    );

    // 4. Send emails (outside the transaction — failure here won't roll back DB)
    await sendClosingEmails(
      auction,
      soldWithWinner ? winner : null,
      winningBid,
      amountDue,
      pct,
      commissionRate,
      commissionAmount,
      sellerPayout,
      hasWinner && !reserveMet
    );

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[AuctionCloser] Failed to close auction #${auction.id}:`, err.message);
  }
}

async function sendClosingEmails(auction, winner, winningBid, amountDue, buyerPaymentPercent, commissionRate, commissionAmount, sellerPayout, reserveNotMet = false) {
  try {
    if (winner) {
      // Email to winner
      await sendEmail({
        to: winner.email,
        subject: `🏆 You Won: ${auction.title}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#1f2937">
            <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="color:#fff;margin:0;font-size:28px">🏆 Congratulations!</h1>
              <p style="color:rgba(255,255,255,0.85);margin:8px 0 0">You won the auction</p>
            </div>
            <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
              <h2 style="font-size:20px;color:#1f2937;margin:0 0 16px">${auction.title}</h2>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr style="background:#f9fafb">
                  <td style="padding:10px 12px;color:#6b7280">Winning Bid</td>
                  <td style="padding:10px 12px;font-weight:700;color:#4f46e5;font-size:18px">RWF ${winningBid.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding:10px 12px;color:#6b7280">Amount Due (${buyerPaymentPercent}%)</td>
                  <td style="padding:10px 12px;font-weight:700;color:#dc2626;font-size:18px">RWF ${amountDue.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding:10px 12px;color:#6b7280">Auction Closed</td>
                  <td style="padding:10px 12px;color:#1f2937">${new Date().toLocaleString()}</td>
                </tr>
              </table>
              <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:20px 0">
                <p style="margin:0;font-size:14px;color:#92400e">
                  <strong>Next steps:</strong> Please pay <strong>RWF ${amountDue.toLocaleString()}</strong>
                  (${buyerPaymentPercent}% of your winning bid) from your buyer dashboard via Mobile Money.
                </p>
              </div>
              <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/buyer/dashboard"
                 style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;
                        padding:12px 24px;border-radius:8px;font-weight:600;margin-top:8px">
                Pay Now
              </a>
            </div>
          </div>
        `,
      });
    }

    // Email to seller
    await sendEmail({
      to: auction.seller_email,
      subject: winner
        ? `✅ Auction Sold: ${auction.title}`
        : reserveNotMet
        ? `📋 Reserve Not Met: ${auction.title}`
        : `📭 Auction Ended — No Bids: ${auction.title}`,
      html: winner
        ? `
          <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#1f2937">
            <div style="background:linear-gradient(135deg,#059669,#10b981);padding:32px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="color:#fff;margin:0;font-size:28px">✅ Your Auction Sold!</h1>
            </div>
            <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
              <h2 style="font-size:20px;margin:0 0 16px">${auction.title}</h2>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr style="background:#f9fafb">
                  <td style="padding:10px 12px;color:#6b7280">Winning Bid</td>
                  <td style="padding:10px 12px;font-weight:700;color:#059669;font-size:18px">$${winningBid.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding:10px 12px;color:#6b7280">Winner</td>
                  <td style="padding:10px 12px;color:#1f2937">${winner.full_name}</td>
                </tr>
                <tr style="background:#f9fafb">
                  <td style="padding:10px 12px;color:#6b7280">Platform Commission (${commissionRate}%)</td>
                  <td style="padding:10px 12px;color:#dc2626">-$${commissionAmount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding:10px 12px;color:#6b7280;font-weight:600">Your Payout</td>
                  <td style="padding:10px 12px;font-weight:700;color:#059669;font-size:18px">$${sellerPayout.toLocaleString()}</td>
                </tr>
              </table>
              <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/seller/auction/${auction.id}"
                 style="display:inline-block;background:#059669;color:#fff;text-decoration:none;
                        padding:12px 24px;border-radius:8px;font-weight:600;margin-top:20px">
                View in Dashboard
              </a>
            </div>
          </div>
        `
        : reserveNotMet
        ? `
          <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#1f2937">
            <div style="background:#f59e0b;padding:32px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="color:#fff;margin:0;font-size:28px">📋 Reserve Price Not Met</h1>
            </div>
            <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
              <p>Your auction <strong>${auction.title}</strong> ended with a highest bid of <strong>$${winningBid.toLocaleString()}</strong>, which did not reach your reserve price.</p>
              <p style="color:#6b7280;font-size:14px">The item has not been sold. You may relist it, or lower your reserve price.</p>
              <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/seller/create-auction"
                 style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;
                        padding:12px 24px;border-radius:8px;font-weight:600;margin-top:16px">
                Relist Item
              </a>
            </div>
          </div>
        `
        : `
          <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#1f2937">
            <div style="background:#6b7280;padding:32px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="color:#fff;margin:0;font-size:28px">📭 Auction Ended — No Bids</h1>
            </div>
            <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
              <p>Your auction <strong>${auction.title}</strong> ended without receiving any bids.</p>
              <p style="color:#6b7280;font-size:14px">
                Consider relisting with a lower starting price or different category.
              </p>
              <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/seller/create-auction"
                 style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;
                        padding:12px 24px;border-radius:8px;font-weight:600;margin-top:16px">
                Create New Auction
              </a>
            </div>
          </div>
        `,
    });
  } catch (emailErr) {
    // Log but don't crash — email failure should not affect the close result
    console.error(`[AuctionCloser] Email send failed for auction #${auction.id}:`, emailErr.message);
  }
}

/**
 * Start the cron loop.
 * @param {number} intervalMs  How often to check (default 60000 = 1 minute)
 */
function startAuctionCloser(intervalMs = 60_000) {
  console.log(`[AuctionCloser] Started — checking every ${intervalMs / 1000}s`);

  // Run once immediately on startup, then on interval
  closeExpiredAuctions();
  return setInterval(closeExpiredAuctions, intervalMs);
}

module.exports = { startAuctionCloser, closeExpiredAuctions };
