const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/categories — public, returns active categories
router.get('/', async (req, res) => {
  try {
    const all = req.query.all === 'true';
    const result = await pool.query(
      `SELECT * FROM categories ${all ? '' : 'WHERE is_active = true'} ORDER BY name`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/categories — create (Admin)
router.post(
  '/',
  authenticate,
  authorize('Admin'),
  [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('icon').trim().notEmpty().withMessage('Icon is required.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, icon, description } = req.body;
    try {
      const result = await pool.query(
        `INSERT INTO categories (name, icon, description) VALUES ($1, $2, $3) RETURNING *`,
        [name, icon, description || '']
      );
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ message: 'Category name already exists.' });
      }
      console.error(err);
      return res.status(500).json({ message: 'Server error.' });
    }
  }
);

// POST /api/categories/:id/toggle — toggle active (Admin)
router.post('/:id/toggle', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE categories SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Category not found.' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/categories/:id — delete (Admin)
router.delete('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Category not found.' });
    return res.json({ message: 'Category deleted.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
