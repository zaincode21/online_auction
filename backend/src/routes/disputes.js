const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

function formatDispute(d) {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    raisedByUserId: d.raised_by_user_id,
    raisedByName: d.raised_by_name,
    auctionItemId: d.auction_item_id,
    auctionTitle: d.auction_title,
    status: d.status,
    adminNote: d.admin_note,
    createdAt: d.created_at,
    resolvedAt: d.resolved_at,
  };
}

// GET /api/disputes — list (Admin: all, Buyer: own)
router.get('/', authenticate, async (req, res) => {
  try {
    let query;
    let params;
    if (req.user.role === 'Admin') {
      query = `
        SELECT d.*, u.full_name AS raised_by_name, a.title AS auction_title
        FROM disputes d
        LEFT JOIN users u ON d.raised_by_user_id = u.id
        LEFT JOIN auctions a ON d.auction_item_id = a.id
        ORDER BY d.created_at DESC
      `;
      params = [];
    } else {
      query = `
        SELECT d.*, u.full_name AS raised_by_name, a.title AS auction_title
        FROM disputes d
        LEFT JOIN users u ON d.raised_by_user_id = u.id
        LEFT JOIN auctions a ON d.auction_item_id = a.id
        WHERE d.raised_by_user_id = $1
        ORDER BY d.created_at DESC
      `;
      params = [req.user.id];
    }
    const result = await pool.query(query, params);
    return res.json(result.rows.map(formatDispute));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/disputes — raise a dispute (Buyer)
router.post(
  '/',
  authenticate,
  authorize('Buyer'),
  [
    body('title').trim().notEmpty().withMessage('Title is required.'),
    body('description').trim().notEmpty().withMessage('Description is required.'),
    body('auctionItemId').isInt().withMessage('Auction ID is required.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { title, description, auctionItemId } = req.body;
    try {
      const result = await pool.query(
        `INSERT INTO disputes (title, description, raised_by_user_id, auction_item_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [title, description, req.user.id, parseInt(auctionItemId)]
      );
      return res.status(201).json(formatDispute(result.rows[0]));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Server error.' });
    }
  }
);

// POST /api/disputes/:id/resolve — resolve (Admin)
router.post('/:id/resolve', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { adminNote, status } = req.body;
    const result = await pool.query(
      `UPDATE disputes
       SET status = $1, admin_note = $2, resolved_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status || 'Resolved', adminNote || '', req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Dispute not found.' });
    return res.json(formatDispute(result.rows[0]));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
