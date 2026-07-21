require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const auctionRoutes = require('./routes/auctions');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const disputeRoutes = require('./routes/disputes');
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/ai');
const notificationRoutes = require('./routes/notifications');
const watchlistRoutes = require('./routes/watchlist');
const paymentRoutes = require('./routes/payments');
const pool = require('./db/pool');
const { startAuctionCloser } = require('./services/auctionCloser');

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      // Keep raw body for Mobile Money webhook HMAC verification
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/payments', paymentRoutes);

// Public platform stats (no auth) — used by homepage
app.get('/api/stats', async (_req, res) => {
  try {
    const [auctionsRes, usersRes, bidsRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_live = true AND ends_at > NOW()) AS live,
          COUNT(*) FILTER (WHERE status = 'ended' OR (ends_at < NOW() AND is_live = false)) AS ended
        FROM auctions
      `),
      pool.query(`SELECT COUNT(*) AS total FROM users`),
      pool.query(`SELECT COUNT(*) AS total FROM bids`),
    ]);
    return res.json({
      liveAuctions: parseInt(auctionsRes.rows[0].live, 10),
      endedAuctions: parseInt(auctionsRes.rows[0].ended, 10),
      totalUsers: parseInt(usersRes.rows[0].total, 10),
      totalBids: parseInt(bidsRes.rows[0].total, 10),
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`GavelPro API running on http://localhost:${PORT}`);
  startAuctionCloser(15_000);
});
