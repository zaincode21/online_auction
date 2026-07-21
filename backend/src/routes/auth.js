const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// Helper: generate 6-digit code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: sign JWT
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, fullName: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
}

// POST /api/auth/register
router.post(
  '/register',
  [
    body('fullName').trim().notEmpty().withMessage('Full name is required.'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('confirmPassword').custom((val, { req }) => {
      if (val !== req.body.password) throw new Error('Passwords do not match.');
      return true;
    }),
    body('role').isIn(['Buyer', 'Seller']).withMessage('Role must be Buyer or Seller.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { fullName, email, password, role } = req.body;

    try {
      // Check duplicate email
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ message: 'Email is already registered.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO users (email, password_hash, full_name, role, is_email_verified)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id, email, full_name, role`,
        [email, passwordHash, fullName, role]
      );

      const user = result.rows[0];
      const token = signToken(user);

      return res.status(201).json({
        message: 'Registration successful.',
        token,
        user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
      });
    } catch (err) {
      console.error('Register error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (result.rows.length === 0) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      const user = result.rows[0];

      // Check lockout
      if (user.lockout_end && new Date(user.lockout_end) > new Date()) {
        const unlockAt = new Date(user.lockout_end).toLocaleTimeString();
        return res.status(403).json({ message: `Account locked. Try again after ${unlockAt}.` });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        // Increment failed attempts
        const attempts = user.failed_login_attempts + 1;
        let lockoutEnd = null;
        if (attempts >= 5) {
          lockoutEnd = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        }
        await pool.query(
          'UPDATE users SET failed_login_attempts = $1, lockout_end = $2 WHERE id = $3',
          [attempts, lockoutEnd, user.id]
        );
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      // Reset failed attempts on success
      await pool.query(
        'UPDATE users SET failed_login_attempts = 0, lockout_end = NULL WHERE id = $1',
        [user.id]
      );

      const token = signToken(user);

      return res.json({
        message: 'Login successful.',
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  }
);

// GET /api/auth/me — return current user profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, role, company_name, bio, profile_picture_url, address, is_email_verified, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const u = result.rows[0];
    return res.json({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      companyName: u.company_name,
      bio: u.bio,
      profilePictureUrl: u.profile_picture_url,
      address: u.address,
      isEmailVerified: u.is_email_verified,
      createdAt: u.created_at,
    });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
