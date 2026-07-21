const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// All watchlist routes require authentication
router.use(authenticate);

// GET /api/watchlist — current user's watched auctions
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.title, a.category, a.condition, a.lot_number,
              a.current_bid, a.bid_count, a.ends_at, a.image_url,
              a.is_live, a.status, a.reserve_met, a.anti_snipe_minutes,
              w.created_at AS watched_at
       FROM watchlists w
       JOIN auctions a ON a.id = w.auction_id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Get watchlist error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/watchlist/:auctionId — add to watchlist
router.post('/:auctionId', async (req, res) => {
  try {
    const { auctionId } = req.params;

    // Verify auction exists
    const auctionRes = await pool.query('SELECT id FROM auctions WHERE id = $1', [auctionId]);
    if (auctionRes.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found.' });
    }

    await pool.query(
      `INSERT INTO watchlists (user_id, auction_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.user.id, auctionId]
    );

    return res.status(201).json({ message: 'Added to watchlist.', watching: true });
  } catch (err) {
    console.error('Add watchlist error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/watchlist/:auctionId — remove from watchlist
router.delete('/:auctionId', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM watchlists WHERE user_id = $1 AND auction_id = $2`,
      [req.user.id, req.params.auctionId]
    );
    return res.json({ message: 'Removed from watchlist.', watching: false });
  } catch (err) {
    console.error('Remove watchlist error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/watchlist/:auctionId/status — check if watching
router.get('/:auctionId/status', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id FROM watchlists WHERE user_id = $1 AND auction_id = $2`,
      [req.user.id, req.params.auctionId]
    );
    return res.json({ watching: result.rows.length > 0 });
  } catch (err) {
    console.error('Watchlist status error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
