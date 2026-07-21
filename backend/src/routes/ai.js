const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

/**
 * GET /api/ai/bid-prediction
 *
 * Query params:
 *   category      - auction category name (required)
 *   startingBid   - proposed starting bid amount (required)
 *   durationDays  - auction duration in days (optional, default 7)
 *
 * Returns a statistical prediction of the expected final price based on
 * historical bid data for the same category, requiring no external AI service.
 *
 * Algorithm:
 *   1. Pull all ended auctions in the same category that received at least 1 bid.
 *   2. Calculate the historical average bid multiplier (final / starting).
 *   3. Adjust for duration (shorter = less time = lower multiplier).
 *   4. Compute predicted price, confidence band, and competitiveness label.
 */
router.get('/bid-prediction', async (req, res) => {
  try {
    const { category, startingBid, durationDays = 7 } = req.query;

    if (!category || !startingBid) {
      return res.status(400).json({ message: 'category and startingBid are required.' });
    }

    const starting = parseFloat(startingBid);
    const duration = parseFloat(durationDays);

    if (isNaN(starting) || starting <= 0) {
      return res.status(400).json({ message: 'startingBid must be a positive number.' });
    }

    // ── 1. Fetch historical data for this category ──────────────────────────
    const historyResult = await pool.query(
      `SELECT
         a.starting_bid,
         a.current_bid   AS final_bid,
         a.bid_count,
         EXTRACT(EPOCH FROM (a.ends_at - a.starts_at)) / 86400 AS duration_days
       FROM auctions a
       WHERE a.category = $1
         AND a.ends_at < NOW()
         AND a.bid_count > 0
         AND a.current_bid > a.starting_bid
       ORDER BY a.ends_at DESC
       LIMIT 100`,
      [category]
    );

    const rows = historyResult.rows;

    // ── 2. Also pull same-category stats for bid activity ───────────────────
    const activityResult = await pool.query(
      `SELECT
         COUNT(DISTINCT b.auction_item_id) AS active_auctions,
         AVG(b.amount)                     AS avg_bid_amount,
         COUNT(b.id)                       AS total_bids
       FROM bids b
       JOIN auctions a ON a.id = b.auction_item_id
       WHERE a.category = $1
         AND b.timestamp > NOW() - INTERVAL '30 days'`,
      [category]
    );

    const activity = activityResult.rows[0];
    const recentBidCount = parseInt(activity.total_bids) || 0;

    // ── 3. Calculate prediction ──────────────────────────────────────────────
    let prediction;

    if (rows.length === 0) {
      // No historical data — return a conservative baseline estimate
      prediction = buildBaselinePrediction(starting, duration, recentBidCount);
    } else {
      prediction = buildStatisticalPrediction(rows, starting, duration, recentBidCount);
    }

    return res.json(prediction);
  } catch (err) {
    console.error('Bid prediction error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

/**
 * GET /api/ai/market-insight/:category
 * Returns overall category health metrics for the buyer detail page.
 */
router.get('/market-insight/:category', async (req, res) => {
  try {
    const { category } = req.params;

    const result = await pool.query(
      `SELECT
         COUNT(*)                                                        AS total_auctions,
         COUNT(*) FILTER (WHERE is_live = true AND ends_at > NOW())     AS live_auctions,
         AVG(bid_count)                                                  AS avg_bids_per_auction,
         AVG(current_bid - starting_bid)                                AS avg_price_lift,
         AVG(current_bid)                                               AS avg_final_price,
         MAX(current_bid)                                               AS highest_sale,
         MIN(current_bid) FILTER (WHERE bid_count > 0)                 AS lowest_sale
       FROM auctions
       WHERE category = $1`,
      [category]
    );

    const row = result.rows[0];

    const avgBids = parseFloat(row.avg_bids_per_auction) || 0;
    const liveCount = parseInt(row.live_auctions) || 0;
    const totalCount = parseInt(row.total_auctions) || 0;

    // Competitiveness score 0-100
    const competitivenessScore = Math.min(100, Math.round(avgBids * 10 + liveCount * 5));

    return res.json({
      category,
      totalAuctions: totalCount,
      liveAuctions: liveCount,
      avgBidsPerAuction: Math.round(avgBids * 10) / 10,
      avgPriceLift: Math.round(parseFloat(row.avg_price_lift) || 0),
      avgFinalPrice: Math.round(parseFloat(row.avg_final_price) || 0),
      highestSale: Math.round(parseFloat(row.highest_sale) || 0),
      lowestSale: Math.round(parseFloat(row.lowest_sale) || 0),
      competitivenessScore,
      competitivenessLabel: getCompetitivenessLabel(competitivenessScore),
    });
  } catch (err) {
    console.error('Market insight error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildStatisticalPrediction(rows, startingBid, durationDays, recentBidCount) {
  // Calculate multipliers (final / starting) for each historical auction
  const multipliers = rows.map((r) => parseFloat(r.final_bid) / parseFloat(r.starting_bid));

  // Mean and standard deviation of multipliers
  const mean = multipliers.reduce((s, v) => s + v, 0) / multipliers.length;
  const variance = multipliers.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / multipliers.length;
  const stdDev = Math.sqrt(variance);

  // Duration adjustment: 7-day baseline; shorter auctions get slightly less bidding
  const durationFactor = Math.pow(Math.min(durationDays, 30) / 7, 0.15);

  // Average bid count per historical auction
  const avgHistoricalBids = rows.reduce((s, r) => s + parseInt(r.bid_count), 0) / rows.length;

  const adjustedMean = mean * durationFactor;
  const predictedPrice = Math.round(startingBid * adjustedMean * 100) / 100;
  const low = Math.round(startingBid * Math.max(1, adjustedMean - stdDev) * 100) / 100;
  const high = Math.round(startingBid * (adjustedMean + stdDev) * 100) / 100;

  // Confidence: higher with more data points
  const confidence = Math.min(95, Math.round(50 + rows.length * 0.8));

  // Competitiveness based on avg bids and recent activity
  const competitivenessScore = Math.min(100, Math.round(avgHistoricalBids * 8 + recentBidCount * 2));

  const priceLift = predictedPrice - startingBid;
  const priceLiftPct = Math.round((priceLift / startingBid) * 100);

  return {
    predictedFinalPrice: predictedPrice,
    priceLow: low,
    priceHigh: high,
    confidencePercent: confidence,
    dataPoints: rows.length,
    avgHistoricalBids: Math.round(avgHistoricalBids * 10) / 10,
    priceLiftAmount: Math.round(priceLift * 100) / 100,
    priceLiftPercent: priceLiftPct,
    competitivenessScore,
    competitivenessLabel: getCompetitivenessLabel(competitivenessScore),
    insight: buildInsightMessage(priceLiftPct, competitivenessScore, rows.length, startingBid, predictedPrice),
    hasHistoricalData: true,
  };
}

function buildBaselinePrediction(startingBid, durationDays, recentBidCount) {
  // Conservative 15% lift estimate when no history exists
  const estimatedMultiplier = 1 + (0.1 + durationDays * 0.01);
  const predictedPrice = Math.round(startingBid * estimatedMultiplier * 100) / 100;
  const competitivenessScore = Math.min(40, recentBidCount * 5);

  return {
    predictedFinalPrice: predictedPrice,
    priceLow: startingBid,
    priceHigh: Math.round(startingBid * 1.5 * 100) / 100,
    confidencePercent: 30,
    dataPoints: 0,
    avgHistoricalBids: 0,
    priceLiftAmount: Math.round((predictedPrice - startingBid) * 100) / 100,
    priceLiftPercent: Math.round(((predictedPrice - startingBid) / startingBid) * 100),
    competitivenessScore,
    competitivenessLabel: getCompetitivenessLabel(competitivenessScore),
    insight: 'No historical data for this category yet. Estimate based on platform averages.',
    hasHistoricalData: false,
  };
}

function getCompetitivenessLabel(score) {
  if (score >= 75) return 'Very Competitive';
  if (score >= 50) return 'Competitive';
  if (score >= 25) return 'Moderate';
  return 'Low Activity';
}

function buildInsightMessage(liftPct, competitivenessScore, dataPoints, startingBid, predictedPrice) {
  const priceStr = `$${predictedPrice.toLocaleString()}`;
  const liftStr = `${liftPct}%`;

  if (competitivenessScore >= 75) {
    return `High demand in this category. Based on ${dataPoints} past auctions, bids typically rise ${liftStr} above the starting price — predicted final: ${priceStr}.`;
  }
  if (competitivenessScore >= 50) {
    return `Moderate-to-high interest. Historical data (${dataPoints} auctions) suggests a ${liftStr} price increase, reaching around ${priceStr}.`;
  }
  if (liftPct > 20) {
    return `This category shows solid bid activity. Expected final price is ${priceStr}, a ${liftStr} increase from starting bid.`;
  }
  return `Lower activity in this category. Expected final price is around ${priceStr} based on ${dataPoints} past auctions.`;
}

module.exports = router;
