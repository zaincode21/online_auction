const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const {
  initiateDebit,
  isSuccessfulCallback,
  isFailedCallback,
  verifyWebhookSignature,
} = require('../services/mobileMoney');

function formatPayment(r) {
  const amountDue = parseFloat(r.amount_due ?? r.winning_bid ?? 0);
  const amountPaid = parseFloat(r.amount_paid ?? 0);
  const remaining = Math.max(0, Math.round((amountDue - amountPaid) * 100) / 100);
  return {
    id: r.id,
    auctionId: r.auction_id,
    auctionTitle: r.auction_title,
    winningBid: parseFloat(r.winning_bid),
    amountDue,
    amountPaid,
    remaining,
    paymentStatus: r.payment_status || 'unpaid',
    closedAt: r.closed_at,
  };
}

// GET /api/payments/my — buyer's won auctions with payment status
router.get('/my', authenticate, authorize('Buyer'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ar.*, a.title AS auction_title
       FROM auction_results ar
       JOIN auctions a ON a.id = ar.auction_id
       WHERE ar.winner_id = $1
       ORDER BY ar.closed_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows.map(formatPayment));
  } catch (err) {
    console.error('My payments error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/payments/:resultId/pay — buyer initiates LIVE Mobile Money payment
router.post(
  '/:resultId/pay',
  authenticate,
  authorize('Buyer'),
  [
    body('phone').trim().notEmpty().withMessage('Mobile money phone number is required.'),
    body('amount').optional().isFloat({ min: 1 }).withMessage('Amount must be at least 1.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const resultId = parseInt(req.params.resultId, 10);
    const { phone } = req.body;

    try {
      const current = await pool.query(
        `SELECT ar.*, a.title AS auction_title, u.full_name, u.email
         FROM auction_results ar
         JOIN auctions a ON a.id = ar.auction_id
         JOIN users u ON u.id = ar.winner_id
         WHERE ar.id = $1 AND ar.winner_id = $2`,
        [resultId, req.user.id]
      );

      if (current.rows.length === 0) {
        return res.status(404).json({ message: 'Won auction not found.' });
      }

      const row = current.rows[0];
      const amountDue = parseFloat(row.amount_due ?? row.winning_bid ?? 0);
      const amountPaid = parseFloat(row.amount_paid ?? 0);
      const remaining = Math.max(0, amountDue - amountPaid);

      if (remaining <= 0 || row.payment_status === 'paid') {
        return res.status(400).json({ message: 'This auction is already fully paid.' });
      }

      let payAmount = req.body.amount != null ? parseFloat(req.body.amount) : remaining;
      if (Number.isNaN(payAmount) || payAmount <= 0) {
        return res.status(400).json({ message: 'Invalid payment amount.' });
      }
      // Full pay: never exceed remaining; default to remaining
      if (payAmount > remaining) payAmount = remaining;

      await pool.query(
        `UPDATE auction_results SET payment_status = 'pending' WHERE id = $1`,
        [resultId]
      );

      const externalId = `gavel-${resultId}-${Date.now()}`;
      const momo = await initiateDebit({
        amount: payAmount,
        phone,
        clientName: row.full_name,
        email: row.email,
        externalId,
        description: `Payment for auction: ${row.auction_title}`,
      });

      if (!momo.ok) {
        const revertStatus = amountPaid > 0 ? 'partial' : 'unpaid';
        await pool.query(
          `UPDATE auction_results SET payment_status = $1 WHERE id = $2`,
          [revertStatus, resultId]
        );
        return res.status(502).json({
          message: momo.error || 'Payment initiation failed.',
          provider: momo.data,
        });
      }

      // Simulate / immediate complete: apply payment now (full pay when payAmount === remaining)
      if (momo.data?.simulated || momo.complete) {
        const newPaid = Math.min(amountDue, amountPaid + payAmount);
        const paymentStatus = newPaid >= amountDue ? 'paid' : 'partial';
        await pool.query(
          `UPDATE auction_results
           SET amount_paid = $1, payment_status = $2
           WHERE id = $3`,
          [newPaid, paymentStatus, resultId]
        );
      }
      // else: stay pending until Ishema webhook

      const updated = await pool.query(
        `SELECT ar.*, a.title AS auction_title
         FROM auction_results ar
         JOIN auctions a ON a.id = ar.auction_id
         WHERE ar.id = $1`,
        [resultId]
      );

      const payment = formatPayment(updated.rows[0]);
      return res.json({
        message: momo.data?.simulated
          ? (payment.paymentStatus === 'paid'
            ? 'Full payment recorded successfully.'
            : 'Partial payment recorded.')
          : 'Payment request sent to your phone. Dial *182# / check MTN MoMo or Airtel Money and approve.',
        payment,
        externalId,
        referenceId: momo.referenceId || null,
        provider: momo.data,
      });
    } catch (err) {
      console.error('Buyer pay error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  }
);

async function handleMobileMoneyWebhook(req, res) {
  const verified = verifyWebhookSignature(req);
  if (!verified.ok) {
    console.warn('[MobileMoney] webhook rejected:', verified.error);
    return res.status(401).json({ message: verified.error || 'Unauthorized.' });
  }

  try {
    console.log('[MobileMoney] webhook:', JSON.stringify(req.body));
    const body = req.body || {};
    const externalId = String(body.external_id || body.externalId || body.refid || body.ref || '');
    const match = externalId.match(/^gavel-(\d+)-/);
    if (!match) {
      return res.json({ status: 200, message: 'success', received: true });
    }

    const resultId = parseInt(match[1], 10);
    const current = await pool.query(`SELECT * FROM auction_results WHERE id = $1`, [resultId]);
    if (current.rows.length === 0) {
      return res.json({ status: 200, message: 'success', received: true });
    }

    const row = current.rows[0];
    const amountDue = parseFloat(row.amount_due ?? row.winning_bid ?? 0);
    const alreadyPaid = parseFloat(row.amount_paid || 0);
    const cbAmount = parseFloat(body.amount || 0);

    if (isSuccessfulCallback(body)) {
      const add = cbAmount > 0 ? cbAmount : Math.max(0, amountDue - alreadyPaid);
      const newPaid = Math.min(amountDue, alreadyPaid + add);
      const paymentStatus = newPaid >= amountDue ? 'paid' : 'partial';
      await pool.query(
        `UPDATE auction_results
         SET amount_paid = $1, payment_status = $2
         WHERE id = $3`,
        [newPaid, paymentStatus, resultId]
      );
      console.log(`[MobileMoney] payment #${resultId} -> ${paymentStatus} (paid ${newPaid})`);
    } else if (isFailedCallback(body)) {
      await pool.query(
        `UPDATE auction_results SET payment_status = $1 WHERE id = $2`,
        [alreadyPaid > 0 ? 'partial' : 'unpaid', resultId]
      );
      console.log(`[MobileMoney] payment #${resultId} failed/cancelled`);
    }

    // mopay-compatible ack
    return res.json({ status: 200, message: 'success' });
  } catch (err) {
    console.error('Payment webhook error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/payments/webhooks/mobile-money — primary Ishema webhook
router.post('/webhooks/mobile-money', handleMobileMoneyWebhook);

// POST /api/payments/callback — legacy alias (same HMAC check)
router.post('/callback', handleMobileMoneyWebhook);

module.exports = router;
