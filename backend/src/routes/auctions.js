const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

// --- Multer storage for auction images ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/auctions');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// --- Format row helper ---
function formatAuction(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    condition: row.condition || 'Not Specified',
    lotNumber: row.lot_number || null,
    startingBid: parseFloat(row.starting_bid),
    currentBid: parseFloat(row.current_bid),
    minimumIncrement: parseFloat(row.minimum_increment),
    bidCount: row.bid_count,
    // Reserve price — only expose whether it's set and whether it's been met;
    // never reveal the actual amount to buyers.
    hasReserve: row.reserve_price != null,
    reserveMet: row.reserve_met || false,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    imageUrl: row.image_url,
    sellerId: row.seller_id,
    sellerName: row.seller_name || row.auctioneer_name,
    auctioneerName: row.auctioneer_name,
    isFeatured: row.is_featured,
    isLive: row.is_live,
    status: row.status,
    antiSnipeMinutes: row.anti_snipe_minutes ?? 3,
    snipeExtensions: row.snipe_extensions ?? 0,
    winnerId: row.winner_id,
    closedAt: row.closed_at,
    createdAt: row.created_at,
  };
}

// --- Format row for seller/admin (includes reserve_price actual value) ---
function formatAuctionPrivate(row) {
  return {
    ...formatAuction(row),
    reservePrice: row.reserve_price != null ? parseFloat(row.reserve_price) : null,
  };
}

// GET /api/auctions/seller/my — seller's own auctions (MUST be before /:id)
router.get('/seller/my', authenticate, authorize('Seller', 'Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.full_name AS seller_name
       FROM auctions a
       LEFT JOIN users u ON a.seller_id = u.id
       WHERE a.seller_id = $1
       ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows.map(formatAuctionPrivate));
  } catch (err) {
    console.error('Seller auctions error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/auctions/seller/analytics — seller dashboard charts
router.get('/seller/analytics', authenticate, authorize('Seller', 'Admin'), async (req, res) => {
  try {
    const sellerId = req.user.id;

    const [summaryRes, statusRes, bidActivityRes, salesRes, topAuctionsRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total_auctions,
           COUNT(*) FILTER (WHERE is_live = true AND ends_at > NOW())::int AS live,
           COUNT(*) FILTER (WHERE ends_at < NOW() OR status = 'ended')::int AS ended,
           COUNT(*) FILTER (WHERE status = 'preview' OR (is_live = false AND ends_at > NOW() AND status != 'ended'))::int AS pending,
           COALESCE(SUM(bid_count), 0)::int AS total_bids,
           COALESCE(SUM(current_bid), 0)::float AS total_bid_value
         FROM auctions
         WHERE seller_id = $1`,
        [sellerId]
      ),
      pool.query(
        `SELECT
           CASE
             WHEN is_live = true AND ends_at > NOW() THEN 'Live'
             WHEN ends_at < NOW() OR status = 'ended' THEN 'Ended'
             ELSE 'Pending'
           END AS name,
           COUNT(*)::int AS value
         FROM auctions
         WHERE seller_id = $1
         GROUP BY 1
         ORDER BY 1`,
        [sellerId]
      ),
      pool.query(
        `SELECT
           d::date AS day,
           COALESCE(COUNT(b.id), 0)::int AS bid_count,
           COALESCE(SUM(b.amount), 0)::float AS bid_volume
         FROM generate_series(
           (CURRENT_DATE - INTERVAL '13 days')::timestamp,
           CURRENT_DATE::timestamp,
           '1 day'
         ) AS d
         LEFT JOIN auctions a
           ON a.seller_id = $1
         LEFT JOIN bids b
           ON b.auction_item_id = a.id
          AND b.timestamp >= d
          AND b.timestamp < d + INTERVAL '1 day'
         GROUP BY d
         ORDER BY d`,
        [sellerId]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE ar.winner_id IS NOT NULL)::int AS sold_count,
           COALESCE(SUM(ar.winning_bid) FILTER (WHERE ar.winner_id IS NOT NULL), 0)::float AS total_sales,
           COALESCE(SUM(ar.seller_payout) FILTER (WHERE ar.winner_id IS NOT NULL), 0)::float AS total_payout,
           COALESCE(SUM(ar.commission_amount) FILTER (WHERE ar.winner_id IS NOT NULL), 0)::float AS total_commission,
           COALESCE(SUM(ar.amount_paid) FILTER (WHERE ar.winner_id IS NOT NULL), 0)::float AS buyer_paid
         FROM auction_results ar
         JOIN auctions a ON a.id = ar.auction_id
         WHERE a.seller_id = $1`,
        [sellerId]
      ),
      pool.query(
        `SELECT a.id, a.title, a.bid_count, a.current_bid, a.ends_at, a.is_live, a.status
         FROM auctions a
         WHERE a.seller_id = $1
         ORDER BY a.bid_count DESC, a.current_bid DESC
         LIMIT 5`,
        [sellerId]
      ),
    ]);

    const summary = summaryRes.rows[0];
    const sales = salesRes.rows[0];

    return res.json({
      summary: {
        totalAuctions: summary.total_auctions,
        live: summary.live,
        ended: summary.ended,
        pending: summary.pending,
        totalBids: summary.total_bids,
        totalBidValue: parseFloat(summary.total_bid_value) || 0,
        soldCount: sales.sold_count,
        totalSales: parseFloat(sales.total_sales) || 0,
        totalPayout: parseFloat(sales.total_payout) || 0,
        totalCommission: parseFloat(sales.total_commission) || 0,
        buyerPaid: parseFloat(sales.buyer_paid) || 0,
      },
      statusBreakdown: statusRes.rows.map((r) => ({
        name: r.name,
        value: parseInt(r.value, 10),
      })),
      bidActivity: bidActivityRes.rows.map((r) => ({
        day: r.day,
        label: new Date(r.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        bids: parseInt(r.bid_count, 10),
        volume: parseFloat(r.bid_volume) || 0,
      })),
      salesTotals: [
        { name: 'Sales', value: parseFloat(sales.total_sales) || 0, fill: '#6366f1' },
        { name: 'Payout', value: parseFloat(sales.total_payout) || 0, fill: '#10b981' },
        { name: 'Commission', value: parseFloat(sales.total_commission) || 0, fill: '#f59e0b' },
        { name: 'Buyer paid', value: parseFloat(sales.buyer_paid) || 0, fill: '#0ea5e9' },
      ],
      topAuctions: topAuctionsRes.rows.map((a) => ({
        id: a.id,
        title: a.title,
        bidCount: a.bid_count,
        currentBid: parseFloat(a.current_bid),
        endsAt: a.ends_at,
        isLive: a.is_live,
        status: a.status,
      })),
    });
  } catch (err) {
    console.error('Seller analytics error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/auctions/preview — upcoming/preview auctions visible to public
router.get('/preview', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.full_name AS seller_name
       FROM auctions a
       LEFT JOIN users u ON a.seller_id = u.id
       WHERE a.status = 'preview'
       ORDER BY a.starts_at ASC
       LIMIT 50`
    );
    return res.json(result.rows.map(formatAuction));
  } catch (err) {
    console.error('Preview auctions error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/auctions — public list (live auctions)
router.get('/', async (req, res) => {
  try {
    const { category, search, featured, page = 1, limit = 12 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ['a.is_live = true'];
    const params = [];
    let idx = 1;

    if (category) {
      where.push(`a.category = $${idx++}`);
      params.push(category);
    }
    if (search) {
      where.push(`(a.title ILIKE $${idx} OR a.description ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (featured === 'true') {
      where.push('a.is_featured = true');
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM auctions a ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT a.*, u.full_name AS seller_name
       FROM auctions a
       LEFT JOIN users u ON a.seller_id = u.id
       ${whereClause}
       ORDER BY a.is_featured DESC, a.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    return res.json({
      auctions: result.rows.map(formatAuction),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    console.error('Get auctions error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/auctions/:id — public detail
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.full_name AS seller_name, u.email AS seller_email
       FROM auctions a
       LEFT JOIN users u ON a.seller_id = u.id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found.' });
    }
    const row = result.rows[0];
    // Seller and admin see the actual reserve price; public only sees hasReserve / reserveMet
    const isOwnerOrAdmin =
      req.headers.authorization &&
      (() => {
        try {
          const jwt = require('jsonwebtoken');
          const token = req.headers.authorization.replace('Bearer ', '');
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          return decoded.role === 'Admin' || decoded.id === row.seller_id;
        } catch { return false; }
      })();
    return res.json(isOwnerOrAdmin ? formatAuctionPrivate(row) : formatAuction(row));
  } catch (err) {
    console.error('Get auction error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auctions — create (Seller or Admin)
router.post(
  '/',
  authenticate,
  authorize('Seller', 'Admin'),
  upload.single('imageFile'),
  [
    body('title').trim().notEmpty().isLength({ max: 100 }),
    body('description').trim().notEmpty(),
    body('category').trim().notEmpty(),
    body('startingBid').isFloat({ min: 1 }),
    body('minimumIncrement').isFloat({ min: 1 }),
    body('startsAt').isISO8601(),
    body('endsAt').isISO8601(),
    body('reservePrice').optional({ nullable: true }).isFloat({ min: 0 }),
    body('condition').optional().isIn(['Mint','Excellent','Good','Fair','Poor','For Parts','Not Specified']),
    body('antiSnipeMinutes').optional().isInt({ min: 0, max: 30 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title, description, category, startingBid, minimumIncrement,
      startsAt, endsAt, imageUrl,
      reservePrice, condition, antiSnipeMinutes,
    } = req.body;

    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (end <= start) {
      return res.status(400).json({ message: 'End time must be after start time.' });
    }

    // Validate reserve >= starting bid
    const parsedReserve = reservePrice != null && reservePrice !== '' ? parseFloat(reservePrice) : null;
    if (parsedReserve !== null && parsedReserve < parseFloat(startingBid)) {
      return res.status(400).json({ message: 'Reserve price must be greater than or equal to the starting bid.' });
    }

    let finalImageUrl = imageUrl || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800&q=80';
    if (req.file) {
      finalImageUrl = `/uploads/auctions/${req.file.filename}`;
    }

    const now = new Date();
    const isLive = now >= start && now < end;
    const parsedAntiSnipe = antiSnipeMinutes != null ? parseInt(antiSnipeMinutes) : 3;
    const parsedCondition = condition || 'Not Specified';

    try {
      // Get seller's full name
      const userResult = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
      const auctioneerName = userResult.rows[0]?.full_name || req.user.email;

      // Auto-assign lot number: seller's auction count + 1
      const lotRes = await pool.query(
        'SELECT COUNT(*) FROM auctions WHERE seller_id = $1', [req.user.id]
      );
      const lotNumber = `LOT-${String(parseInt(lotRes.rows[0].count) + 1).padStart(4, '0')}`;

      const result = await pool.query(
        `INSERT INTO auctions
           (title, description, category, starting_bid, current_bid, minimum_increment,
            starts_at, ends_at, image_url, seller_id, auctioneer_name, is_live, is_featured,
            bid_count, reserve_price, reserve_met, condition, lot_number, anti_snipe_minutes, snipe_extensions)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,false,0,$12,false,$13,$14,$15,0)
         RETURNING *`,
        [
          title, description, category, parseFloat(startingBid), parseFloat(minimumIncrement),
          start, end, finalImageUrl, req.user.id, auctioneerName, isLive,
          parsedReserve, parsedCondition, lotNumber, parsedAntiSnipe,
        ]
      );

      return res.status(201).json(formatAuctionPrivate(result.rows[0]));
    } catch (err) {
      console.error('Create auction error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  }
);

// PUT /api/auctions/:id — edit (owner Seller or Admin)
router.put(
  '/:id',
  authenticate,
  authorize('Seller', 'Admin'),
  upload.single('imageFile'),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Ownership check
      const existing = await pool.query('SELECT * FROM auctions WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ message: 'Auction not found.' });
      }
      const auction = existing.rows[0];
      if (req.user.role !== 'Admin' && auction.seller_id !== req.user.id) {
        return res.status(403).json({ message: 'Access denied.' });
      }

      const {
        title, description, category, startingBid, minimumIncrement, imageUrl,
        reservePrice, condition, antiSnipeMinutes,
      } = req.body;

      let finalImageUrl = imageUrl || auction.image_url;
      if (req.file) {
        finalImageUrl = `/uploads/auctions/${req.file.filename}`;
      }

      const parsedReserve =
        reservePrice !== undefined && reservePrice !== ''
          ? parseFloat(reservePrice)
          : auction.reserve_price;

      const newStartingBid = parseFloat(startingBid) || parseFloat(auction.starting_bid);
      if (parsedReserve !== null && parsedReserve < newStartingBid) {
        return res.status(400).json({ message: 'Reserve price must be greater than or equal to the starting bid.' });
      }

      const result = await pool.query(
        `UPDATE auctions
         SET title=$1, description=$2, category=$3, starting_bid=$4, minimum_increment=$5,
             image_url=$6, reserve_price=$7, condition=$8, anti_snipe_minutes=$9, updated_at=NOW()
         WHERE id=$10
         RETURNING *`,
        [
          title || auction.title,
          description || auction.description,
          category || auction.category,
          newStartingBid,
          parseFloat(minimumIncrement) || parseFloat(auction.minimum_increment),
          finalImageUrl,
          parsedReserve,
          condition || auction.condition || 'Not Specified',
          antiSnipeMinutes != null ? parseInt(antiSnipeMinutes) : auction.anti_snipe_minutes,
          id,
        ]
      );

      return res.json(formatAuctionPrivate(result.rows[0]));
    } catch (err) {
      console.error('Update auction error:', err);
      return res.status(500).json({ message: 'Server error.' });
    }
  }
);

// DELETE /api/auctions/:id — delete (owner or Admin)
router.delete('/:id', authenticate, authorize('Seller', 'Admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT seller_id, is_live, bid_count FROM auctions WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found.' });
    }
    if (req.user.role !== 'Admin' && existing.rows[0].seller_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    // Prevent deletion of live auctions that have received bids (sellers only)
    if (req.user.role !== 'Admin' && existing.rows[0].is_live && parseInt(existing.rows[0].bid_count) > 0) {
      return res.status(400).json({ message: 'Cannot delete a live auction that has bids.' });
    }

    await pool.query('DELETE FROM auctions WHERE id = $1', [id]);
    return res.json({ message: 'Auction deleted.' });
  } catch (err) {
    console.error('Delete auction error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});



// GET /api/auctions/:id/bids — get all bids for an auction
router.get('/:id/bids', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.amount, b.timestamp, u.full_name AS bidder_name, u.email AS bidder_email
       FROM bids b
       JOIN users u ON b.user_id = u.id
       WHERE b.auction_item_id = $1
       ORDER BY b.amount DESC`,
      [req.params.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Get bids error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auctions/:id/bid — place a bid (Buyer or Admin)
router.post('/:id/bid', authenticate, authorize('Buyer', 'Admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query(
      'SELECT * FROM auctions WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (auctionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Auction not found.' });
    }

    const auction = auctionResult.rows[0];
    const now = new Date();

    if (!auction.is_live) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Auction is not live.' });
    }
    if (now >= new Date(auction.ends_at)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Auction has ended.' });
    }
    if (auction.seller_id === req.user.id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Sellers cannot bid on their own auctions.' });
    }

    const { amount } = req.body;
    const bidAmount = parseFloat(amount);
    const minRequired = parseFloat(auction.current_bid) + parseFloat(auction.minimum_increment);

    if (isNaN(bidAmount) || bidAmount < minRequired) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Bid must be at least $${minRequired.toFixed(2)}.`,
      });
    }

    // ── Find the current leading bidder (for outbid notification) ──────────
    const prevLeaderRes = await client.query(
      `SELECT user_id FROM bids
       WHERE auction_item_id = $1
       ORDER BY amount DESC LIMIT 1`,
      [auction.id]
    );
    const prevLeaderId = prevLeaderRes.rows[0]?.user_id || null;

    // ── Insert bid ──────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO bids (amount, user_id, auction_item_id) VALUES ($1, $2, $3)`,
      [bidAmount, req.user.id, auction.id]
    );

    // ── Check if reserve is now met ─────────────────────────────────────────
    const reserveMet =
      auction.reserve_price != null
        ? bidAmount >= parseFloat(auction.reserve_price)
        : true; // no reserve = always met

    // ── Anti-sniping: extend end time if bid lands in final window ──────────
    const antiSnipeMs = (auction.anti_snipe_minutes || 0) * 60 * 1000;
    let newEndsAt = new Date(auction.ends_at);
    let sniped = false;
    if (antiSnipeMs > 0) {
      const timeLeft = newEndsAt - now;
      if (timeLeft <= antiSnipeMs) {
        newEndsAt = new Date(now.getTime() + antiSnipeMs);
        sniped = true;
      }
    }

    // ── Update auction ──────────────────────────────────────────────────────
    await client.query(
      `UPDATE auctions
       SET current_bid = $1,
           bid_count   = bid_count + 1,
           reserve_met = $2,
           ends_at     = $3,
           snipe_extensions = snipe_extensions + $4,
           updated_at  = NOW()
       WHERE id = $5`,
      [bidAmount, reserveMet, newEndsAt, sniped ? 1 : 0, auction.id]
    );

    // ── Outbid notification to previous leader ──────────────────────────────
    if (prevLeaderId && prevLeaderId !== req.user.id) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, auction_id)
         VALUES ($1, 'outbid', $2, $3, $4)`,
        [
          prevLeaderId,
          '⚠️ You\'ve been outbid!',
          `Someone placed a higher bid of $${bidAmount.toLocaleString()} on "${auction.title}". Bid now to stay in the lead.`,
          auction.id,
        ]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Bid placed successfully.',
      newBid: bidAmount,
      reserveMet,
      sniped,
      newEndsAt: newEndsAt.toISOString(),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Place bid error:', err);
    return res.status(500).json({ message: 'Server error.' });
  } finally {
    client.release();
  }
});

// GET /api/auctions/:id/result — get the auction result (winner + payout)
router.get('/:id/result', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ar.*, u.full_name AS winner_name, u.email AS winner_email
       FROM auction_results ar
       LEFT JOIN users u ON ar.winner_id = u.id
       WHERE ar.auction_id = $1
       ORDER BY ar.closed_at DESC
       LIMIT 1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No result found for this auction.' });
    }
    const r = result.rows[0];
    return res.json({
      auctionId: r.auction_id,
      winnerId: r.winner_id,
      winnerName: r.winner_name,
      winnerEmail: r.winner_email,
      winningBid: parseFloat(r.winning_bid),
      commissionRate: parseFloat(r.commission_rate),
      commissionAmount: parseFloat(r.commission_amount),
      sellerPayout: parseFloat(r.seller_payout),
      amountDue: parseFloat(r.amount_due ?? r.winning_bid ?? 0),
      amountPaid: parseFloat(r.amount_paid ?? 0),
      remaining: Math.max(0, parseFloat(r.amount_due ?? r.winning_bid ?? 0) - parseFloat(r.amount_paid ?? 0)),
      paymentStatus: r.payment_status || 'unpaid',
      closedAt: r.closed_at,
    });
  } catch (err) {
    console.error('Get auction result error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
