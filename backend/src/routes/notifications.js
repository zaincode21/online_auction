const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// All notification routes require authentication
router.use(authenticate);

// GET /api/notifications — get current user's notifications (newest first)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.*, a.title AS auction_title, a.image_url AS auction_image
       FROM notifications n
       LEFT JOIN auctions a ON n.auction_id = a.id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    const unreadCount = result.rows.filter((n) => !n.is_read).length;

    return res.json({
      notifications: result.rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        auctionId: n.auction_id,
        auctionTitle: n.auction_title,
        auctionImage: n.auction_image,
        isRead: n.is_read,
        createdAt: n.created_at,
      })),
      unreadCount,
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/notifications/read-all — mark all as read
// IMPORTANT: must be defined before /:id to prevent Express matching "read-all" as an id
router.patch('/read-all', async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    return res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Mark all read error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/notifications/:id/read — mark one notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    return res.json({ message: 'Marked as read.' });
  } catch (err) {
    console.error('Mark read error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/notifications/:id — delete a single notification
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    return res.json({ message: 'Notification deleted.' });
  } catch (err) {
    console.error('Delete notification error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
