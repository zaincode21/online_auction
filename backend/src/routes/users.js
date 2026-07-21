const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

// --- Multer storage for profile pictures ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/profiles');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

function formatUser(u) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    role: u.role,
    companyName: u.company_name,
    bio: u.bio,
    profilePictureUrl: u.profile_picture_url,
    address: u.address,
    isEmailVerified: u.is_email_verified,
    lockoutEnd: u.lockout_end,
    createdAt: u.created_at,
  };
}

// GET /api/users/profile — get own profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found.' });
    return res.json(formatUser(result.rows[0]));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/users/my-bids — auctions the current user has bid on (highest bid per auction)
router.get('/my-bids', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         a.id            AS "auctionId",
         a.title,
         a.category,
         a.current_bid   AS "currentBid",
         a.ends_at       AS "endsAt",
         a.is_live       AS "isLive",
         a.image_url     AS "imageUrl",
         MAX(b.amount)   AS "myBid"
       FROM bids b
       JOIN auctions a ON a.id = b.auction_item_id
       WHERE b.user_id = $1
       GROUP BY a.id
       ORDER BY a.ends_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('My bids error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/users/won-auctions — auctions this buyer has won (with payment status)
router.get('/won-auctions', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         ar.id           AS "id",
         ar.auction_id   AS "auctionId",
         a.title,
         a.image_url     AS "imageUrl",
         ar.winning_bid  AS "winningBid",
         COALESCE(ar.amount_due, ar.winning_bid) AS "amountDue",
         COALESCE(ar.amount_paid, 0) AS "amountPaid",
         GREATEST(0, COALESCE(ar.amount_due, ar.winning_bid) - COALESCE(ar.amount_paid, 0)) AS "remaining",
         COALESCE(ar.payment_status, 'unpaid') AS "paymentStatus",
         ar.closed_at    AS "closedAt"
       FROM auction_results ar
       JOIN auctions a ON a.id = ar.auction_id
       WHERE ar.winner_id = $1
       ORDER BY ar.closed_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows.map((r) => ({
      ...r,
      winningBid: parseFloat(r.winningBid),
      amountDue: parseFloat(r.amountDue),
      amountPaid: parseFloat(r.amountPaid),
      remaining: parseFloat(r.remaining),
    })));
  } catch (err) {
    console.error('Won auctions error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/users/profile — update own profile
router.put('/profile', authenticate, upload.single('profilePicture'), async (req, res) => {
  try {
    const { fullName, companyName, bio, address } = req.body;

    const current = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (current.rows.length === 0) return res.status(404).json({ message: 'User not found.' });
    const u = current.rows[0];

    let profilePictureUrl = u.profile_picture_url;
    if (req.file) {
      profilePictureUrl = `/uploads/profiles/${req.file.filename}`;
    }

    const result = await pool.query(
      `UPDATE users
       SET full_name=$1, company_name=$2, bio=$3, address=$4, profile_picture_url=$5, updated_at=NOW()
       WHERE id=$6
       RETURNING *`,
      [fullName || u.full_name, companyName ?? u.company_name, bio ?? u.bio,
       address ?? u.address, profilePictureUrl, req.user.id]
    );

    return res.json(formatUser(result.rows[0]));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// --- ADMIN ROUTES ---

// GET /api/users — list all users (Admin only)
router.get('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM users WHERE id != $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows.map(formatUser));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/users/:id/suspend — suspend user (Admin)
router.post('/:id/suspend', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET lockout_end = '9999-12-31', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found.' });
    return res.json({ message: 'User suspended.', user: formatUser(result.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/users/:id/unsuspend — lift suspension (Admin)
router.post('/:id/unsuspend', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET lockout_end = NULL, failed_login_attempts = 0, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found.' });
    return res.json({ message: 'User suspension lifted.', user: formatUser(result.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/users/:id — delete user (Admin)
router.delete('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found.' });
    return res.json({ message: 'User deleted.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
