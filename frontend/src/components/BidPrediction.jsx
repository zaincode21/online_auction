import { useState, useEffect, useRef } from 'react';
import api from '../api/axios';
import { formatRwf } from '../utils/currency';

/**
 * BidPrediction — AI-powered bid prediction widget.
 *
 * Props:
 *   category      (string)  — auction category name
 *   startingBid   (number)  — proposed / current starting bid
 *   durationDays  (number)  — auction duration in days (optional)
 *   mode          (string)  — 'seller' | 'buyer'
 *                             seller: helps set a good starting bid
 *                             buyer : shows competitiveness + predicted final price
 *   currentBid    (number)  — buyer mode only: the live current bid
 */
export default function BidPrediction({ category, startingBid, durationDays = 7, mode = 'seller', currentBid }) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const debounceTimer = useRef(null);

  // Re-fetch whenever inputs change (debounced 600 ms)
  useEffect(() => {
    const bid = parseFloat(startingBid);
    if (!category || !bid || bid <= 0) {
      setPrediction(null);
      return;
    }

    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get('/ai/bid-prediction', {
          params: { category, startingBid: bid, durationDays },
        });
        setPrediction(data);
      } catch {
        setError('Prediction unavailable right now.');
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => clearTimeout(debounceTimer.current);
  }, [category, startingBid, durationDays]);

  // ── Nothing to show yet ──────────────────────────────────────────────────
  if (!category || !parseFloat(startingBid)) return null;

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 rounded-full bg-indigo-200" />
          <div className="h-3 w-40 rounded bg-indigo-200" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-indigo-100" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700 flex items-center gap-2">
        <i className="bi bi-exclamation-triangle" />
        {error}
      </div>
    );
  }

  if (!prediction) return null;

  const { competitivenessScore, competitivenessLabel } = prediction;

  // Colour helpers
  const scoreColor =
    competitivenessScore >= 75
      ? 'text-emerald-600'
      : competitivenessScore >= 50
      ? 'text-blue-600'
      : competitivenessScore >= 25
      ? 'text-amber-600'
      : 'text-gray-500';

  const barColor =
    competitivenessScore >= 75
      ? 'bg-emerald-500'
      : competitivenessScore >= 50
      ? 'bg-blue-500'
      : competitivenessScore >= 25
      ? 'bg-amber-400'
      : 'bg-gray-400';

  // ── Buyer mode: Is my bid competitive? ──────────────────────────────────
  if (mode === 'buyer') {
    const activeBid = parseFloat(currentBid) || parseFloat(startingBid);
    const predicted = prediction.predictedFinalPrice;
    const gap = predicted - activeBid;
    const gapPct = Math.round((gap / activeBid) * 100);
    const buyerChance =
      gap <= 0
        ? { label: 'Leading', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', icon: 'bi-trophy' }
        : gap < activeBid * 0.1
        ? { label: 'Close Race', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100', icon: 'bi-lightning-charge' }
        : { label: 'Likely More Bids', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100', icon: 'bi-graph-up-arrow' };

    return (
      <div className={`rounded-xl border ${buyerChance.bg} p-4 space-y-3`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100">
              <i className="bi bi-robot text-indigo-600 text-xs" />
            </span>
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">AI Bid Insight</span>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? 'Less' : 'More'} <i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} />
          </button>
        </div>

        {/* Key numbers */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat
            label="Predicted Final"
            value={formatRwf(predicted)}
            sub={`± ${formatRwf(Math.round((prediction.priceHigh - prediction.priceLow) / 2))}`}
            valueClass="text-indigo-700 font-bold"
          />
          <Stat
            label="Market Activity"
            value={competitivenessLabel}
            valueClass={`${scoreColor} font-semibold text-xs`}
          />
          <Stat
            label="Bid Status"
            value={buyerChance.label}
            valueClass={`${buyerChance.color} font-semibold text-xs`}
            icon={buyerChance.icon}
          />
        </div>

        {/* Competitiveness bar */}
        <CompetitivenessBar score={competitivenessScore} barColor={barColor} />

        {/* Expanded details */}
        {expanded && (
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <p className="text-xs text-gray-500 leading-relaxed">
              <i className="bi bi-info-circle mr-1" />
              {prediction.insight}
            </p>
            {gap > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                <i className="bi bi-arrow-up-right mr-1" />
                Predicted to rise ~{gapPct}% more ({formatRwf(gap, { maximumFractionDigits: 0 })}) above current bid.
              </p>
            )}
            <ConfidenceBadge confidence={prediction.confidencePercent} dataPoints={prediction.dataPoints} />
          </div>
        )}
      </div>
    );
  }

  // ── Seller mode: Should I set a higher/lower starting bid? ──────────────
  const suggestedStart = prediction.predictedFinalPrice
    ? Math.round((prediction.predictedFinalPrice * 0.4) * 100) / 100
    : null;

  const bidTooHigh =
    parseFloat(startingBid) > prediction.predictedFinalPrice * 0.8;

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100">
            <i className="bi bi-robot text-indigo-600 text-xs" />
          </span>
          <span className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">AI Price Prediction</span>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-indigo-400 hover:text-indigo-600 flex items-center gap-1"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? 'Less' : 'Details'} <i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} />
        </button>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat
          label="Predicted Final"
          value={formatRwf(prediction.predictedFinalPrice)}
          valueClass="text-indigo-700 font-bold"
        />
        <Stat
          label="Range"
          value={`${formatRwf(prediction.priceLow)} – ${formatRwf(prediction.priceHigh)}`}
          valueClass="text-gray-700 font-semibold text-xs"
        />
        <Stat
          label="Avg. Bids"
          value={prediction.avgHistoricalBids || '—'}
          sub="per auction"
          valueClass="text-gray-700 font-bold"
        />
      </div>

      {/* Competitiveness bar */}
      <CompetitivenessBar score={competitivenessScore} barColor={barColor} label={competitivenessLabel} />

      {/* Warning if starting bid is too high */}
      {bidTooHigh && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <i className="bi bi-exclamation-triangle text-amber-500 mt-0.5 text-xs" />
          <p className="text-xs text-amber-700">
            Your starting bid is close to the predicted final price. Buyers may skip this auction — consider lowering it to attract more bids.
          </p>
        </div>
      )}

      {/* Suggestion chip */}
      {suggestedStart && !bidTooHigh && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          <i className="bi bi-lightbulb text-emerald-500 text-xs" />
          <p className="text-xs text-emerald-700">
            Suggested starting bid to maximise bidding: <strong>{formatRwf(suggestedStart)}</strong>
          </p>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="pt-2 border-t border-indigo-100 space-y-2">
          <p className="text-xs text-indigo-700 leading-relaxed">
            <i className="bi bi-info-circle mr-1" />
            {prediction.insight}
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
            <span><i className="bi bi-arrow-up-right mr-1 text-emerald-500" />Avg lift: +{prediction.priceLiftPercent}%</span>
            <span><i className="bi bi-database mr-1 text-indigo-400" />Based on {prediction.dataPoints} past auctions</span>
          </div>
          <ConfidenceBadge confidence={prediction.confidencePercent} dataPoints={prediction.dataPoints} />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Stat({ label, value, sub, valueClass = 'text-gray-800 font-bold', icon }) {
  return (
    <div className="bg-white rounded-lg px-2 py-2 shadow-sm">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm leading-tight ${valueClass}`}>
        {icon && <i className={`bi ${icon} mr-1`} />}
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function CompetitivenessBar({ score, barColor, label }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">Market Competitiveness</span>
        <span className="text-xs font-medium text-gray-600">{label || `${score}/100`}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${score}%` }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence, dataPoints }) {
  const color =
    confidence >= 70
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : confidence >= 50
      ? 'bg-blue-50 text-blue-700 border-blue-100'
      : 'bg-amber-50 text-amber-700 border-amber-100';

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${color}`}>
      <i className="bi bi-shield-check" />
      {confidence}% confidence · {dataPoints > 0 ? `${dataPoints} auctions analysed` : 'Baseline estimate'}
    </div>
  );
}
