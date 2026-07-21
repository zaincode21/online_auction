const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

// All admin routes require authentication and Admin role
router.use(authenticate, authorize('Admin'));

// GET /api/admin/dashboard — dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const [usersRes, auctionsRes, bidsRes, suspendedRes, recentUsersRes, bidActivityRes, paymentsRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE role = 'Buyer') AS buyers,
          COUNT(*) FILTER (WHERE role = 'Seller') AS sellers,
          COUNT(*) FILTER (WHERE role = 'Admin') AS admins,
          COUNT(*) AS total
        FROM users
      `),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE is_live = true AND ends_at > NOW()) AS live,
          COUNT(*) FILTER (WHERE ends_at < NOW()) AS ended
        FROM auctions
      `),
      pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(amount),0) AS total_value FROM bids`),
      pool.query(`SELECT COUNT(*) AS count FROM users WHERE lockout_end IS NOT NULL AND lockout_end > NOW()`),
      pool.query(`SELECT id, email, full_name, role, created_at FROM users ORDER BY created_at DESC LIMIT 5`),
      // Last 14 days: bids per day + bid volume
      pool.query(`
        SELECT
          d::date AS day,
          COALESCE(COUNT(b.id), 0)::int AS bid_count,
          COALESCE(SUM(b.amount), 0)::float AS bid_volume
        FROM generate_series(
          (CURRENT_DATE - INTERVAL '13 days')::timestamp,
          CURRENT_DATE::timestamp,
          '1 day'
        ) AS d
        LEFT JOIN bids b
          ON b.timestamp >= d
         AND b.timestamp < d + INTERVAL '1 day'
        GROUP BY d
        ORDER BY d
      `),
      // Payment totals
      pool.query(`
        SELECT
          COALESCE(SUM(COALESCE(amount_due, winning_bid)), 0)::float AS total_due,
          COALESCE(SUM(amount_paid), 0)::float AS total_paid,
          COALESCE(SUM(GREATEST(0, COALESCE(amount_due, winning_bid) - COALESCE(amount_paid, 0))), 0)::float AS total_remaining
        FROM auction_results
        WHERE winner_id IS NOT NULL
      `),
    ]);

    const users = usersRes.rows[0];
    const auctions = auctionsRes.rows[0];
    const bids = bidsRes.rows[0];
    const payments = paymentsRes.rows[0];

    return res.json({
      totalUsers: parseInt(users.total),
      totalBuyers: parseInt(users.buyers),
      totalSellers: parseInt(users.sellers),
      totalAdmins: parseInt(users.admins),
      suspendedUsers: parseInt(suspendedRes.rows[0].count),
      totalAuctions: parseInt(auctions.total),
      liveAuctions: parseInt(auctions.live),
      endedAuctions: parseInt(auctions.ended),
      totalBids: parseInt(bids.total),
      totalBidValue: parseFloat(bids.total_value),
      recentUsers: recentUsersRes.rows.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        createdAt: u.created_at,
      })),
      bidActivity: bidActivityRes.rows.map((r) => ({
        day: r.day,
        label: new Date(r.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        bids: parseInt(r.bid_count, 10),
        volume: parseFloat(r.bid_volume) || 0,
      })),
      paymentTotals: {
        due: parseFloat(payments.total_due) || 0,
        paid: parseFloat(payments.total_paid) || 0,
        remaining: parseFloat(payments.total_remaining) || 0,
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/admin/reports — full analytics
router.get('/reports', async (req, res) => {
  try {
    const [usersRes, auctionsRes, bidsRes, topCatsRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE role = 'Buyer') AS buyers,
          COUNT(*) FILTER (WHERE role = 'Seller') AS sellers,
          COUNT(*) FILTER (WHERE role = 'Admin') AS admins
        FROM users
      `),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE is_live = true AND ends_at > NOW()) AS live,
          COUNT(*) FILTER (WHERE ends_at < NOW()) AS ended
        FROM auctions
      `),
      pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(amount),0) AS total_value FROM bids`),
      pool.query(`
        SELECT
          category AS category_name,
          COUNT(*) AS auction_count,
          COALESCE(SUM(current_bid),0) AS total_value
        FROM auctions
        GROUP BY category
        ORDER BY auction_count DESC
        LIMIT 5
      `),
    ]);

    const bids = bidsRes.rows[0];
    const totalBids = parseInt(bids.total);
    const totalBidValue = parseFloat(bids.total_value);

    return res.json({
      totalUsers: parseInt(usersRes.rows[0].total),
      totalBuyers: parseInt(usersRes.rows[0].buyers),
      totalSellers: parseInt(usersRes.rows[0].sellers),
      totalAdmins: parseInt(usersRes.rows[0].admins),
      totalAuctions: parseInt(auctionsRes.rows[0].total),
      totalLiveAuctions: parseInt(auctionsRes.rows[0].live),
      totalEndedAuctions: parseInt(auctionsRes.rows[0].ended),
      totalBids,
      totalBidValue,
      averageBidAmount: totalBids > 0 ? totalBidValue / totalBids : 0,
      topCategories: topCatsRes.rows.map((c) => ({
        categoryName: c.category_name,
        auctionCount: parseInt(c.auction_count),
        totalValue: parseFloat(c.total_value),
      })),
    });
  } catch (err) {
    console.error('Reports error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/admin/auctions — all auctions
router.get('/auctions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.full_name AS seller_name
       FROM auctions a LEFT JOIN users u ON a.seller_id = u.id
       ORDER BY a.created_at DESC`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/admin/auctions/:id/toggle-live — toggle live status
router.post('/auctions/:id/toggle-live', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE auctions SET is_live = NOT is_live, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Auction not found.' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/admin/auctions/:id/approve — approve listing
router.post('/auctions/:id/approve', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE auctions SET is_live = true, status = 'live', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Auction not found.' });
    return res.json({ message: 'Listing approved.', auction: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/admin/auctions/:id — reject/delete listing
router.delete('/auctions/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM auctions WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Auction not found.' });
    return res.json({ message: 'Auction deleted.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/admin/settings
router.get('/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM platform_settings ORDER BY id');
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/admin/settings/:key
router.put('/settings/:key', async (req, res) => {
  try {
    const { value } = req.body;
    const result = await pool.query(
      `UPDATE platform_settings SET value = $1, updated_at = NOW() WHERE key = $2 RETURNING *`,
      [value, req.params.key]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Setting not found.' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

function formatPaymentRow(r) {
  const amountDue = parseFloat(r.amount_due ?? r.winning_bid ?? 0);
  const amountPaid = parseFloat(r.amount_paid ?? 0);
  const remaining = Math.max(0, Math.round((amountDue - amountPaid) * 100) / 100);
  return {
    id: r.id,
    auctionId: r.auction_id,
    auctionTitle: r.auction_title,
    winnerId: r.winner_id,
    winnerName: r.winner_name,
    winnerEmail: r.winner_email,
    winningBid: parseFloat(r.winning_bid),
    amountDue,
    amountPaid,
    remaining,
    paymentStatus: r.payment_status || 'unpaid',
    closedAt: r.closed_at,
  };
}

// GET /api/admin/payments — winners list with amount due / paid / remaining / status
router.get('/payments', async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let statusFilter = '';
    if (status && ['unpaid', 'partial', 'pending', 'paid'].includes(status)) {
      params.push(status);
      statusFilter = `AND ar.payment_status = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT ar.*, a.title AS auction_title,
              u.full_name AS winner_name, u.email AS winner_email
       FROM auction_results ar
       JOIN auctions a ON a.id = ar.auction_id
       LEFT JOIN users u ON u.id = ar.winner_id
       WHERE ar.winner_id IS NOT NULL
         ${statusFilter}
       ORDER BY
         CASE ar.payment_status
           WHEN 'unpaid' THEN 0
           WHEN 'partial' THEN 1
           WHEN 'pending' THEN 2
           WHEN 'paid' THEN 3
           ELSE 4
         END,
         ar.closed_at DESC`,
      params
    );
    return res.json(result.rows.map(formatPaymentRow));
  } catch (err) {
    console.error('Admin payments list error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/admin/payments/:id — record payment / update status
router.patch('/payments/:id', async (req, res) => {
  try {
    const { amountPaid, paymentStatus, markPaid } = req.body;

    const current = await pool.query(
      `SELECT * FROM auction_results WHERE id = $1 AND winner_id IS NOT NULL`,
      [req.params.id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ message: 'Payment record not found.' });
    }

    const row = current.rows[0];
    const amountDue = parseFloat(row.amount_due ?? row.winning_bid ?? 0);
    let paid = amountPaid != null ? parseFloat(amountPaid) : parseFloat(row.amount_paid || 0);
    if (markPaid) paid = amountDue;
    if (Number.isNaN(paid) || paid < 0) {
      return res.status(400).json({ message: 'Invalid amount paid.' });
    }
    if (paid > amountDue) paid = amountDue;

    let status = paymentStatus;
    if (!status || !['unpaid', 'partial', 'pending', 'paid'].includes(status)) {
      if (paid <= 0) status = 'unpaid';
      else if (paid >= amountDue) status = 'paid';
      else status = 'partial';
    }

    const result = await pool.query(
      `UPDATE auction_results
       SET amount_paid = $1,
           payment_status = $2,
           amount_due = COALESCE(amount_due, ROUND(winning_bid * 0.80, 2))
       WHERE id = $3
       RETURNING *`,
      [paid, status, req.params.id]
    );

    const updated = result.rows[0];
    const auction = await pool.query('SELECT title FROM auctions WHERE id = $1', [updated.auction_id]);
    const winner = updated.winner_id
      ? await pool.query('SELECT full_name, email FROM users WHERE id = $1', [updated.winner_id])
      : { rows: [{}] };

    return res.json(formatPaymentRow({
      ...updated,
      auction_title: auction.rows[0]?.title,
      winner_name: winner.rows[0]?.full_name,
      winner_email: winner.rows[0]?.email,
    }));
  } catch (err) {
    console.error('Admin payment update error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
