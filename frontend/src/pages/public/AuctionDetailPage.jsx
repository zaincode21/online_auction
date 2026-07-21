import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import Countdown from '../../components/Countdown';
import BidPrediction from '../../components/BidPrediction';
import { formatRwf } from '../../utils/currency';

const CONDITION_COLORS = {
  Mint: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Excellent: 'bg-blue-50 text-blue-700 border-blue-200',
  Good: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Fair: 'bg-amber-50 text-amber-700 border-amber-200',
  Poor: 'bg-orange-50 text-orange-700 border-orange-200',
  'For Parts': 'bg-red-50 text-red-700 border-red-200',
  'Not Specified': 'bg-gray-50 text-gray-500 border-gray-200',
};

export default function AuctionDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [bidAmount, setBidAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [watching, setWatching] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [result, setResult] = useState(null);
  // anti-snipe banner: show when auction was just extended
  const [sniped, setSniped] = useState(false);

  const loadAuction = useCallback(async () => {
    try {
      const res = await api.get(`/auctions/${id}`);
      setAuction(res.data);
      setBidAmount(String((parseFloat(res.data.currentBid) + parseFloat(res.data.minimumIncrement)).toFixed(2)));

      // Load winner/result once the auction is no longer live
      if (!res.data.isLive || res.data.status === 'ended' || new Date(res.data.endsAt) < new Date()) {
        try {
          const rRes = await api.get(`/auctions/${id}/result`);
          setResult(rRes.data);
        } catch {
          setResult(null);
        }
      }
    } catch {
      toast.error('Auction not found.');
      navigate('/auctions');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadAuction(); }, [loadAuction]);

  // Auto-poll every 30s while auction is live to catch closer updates
  useEffect(() => {
    if (!auction?.isLive) return;
    const interval = setInterval(() => {
      loadAuction();
      if (user) api.get(`/auctions/${id}/bids`).then((r) => setBids(r.data)).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [auction?.isLive, id, user, loadAuction]);

  // When countdown hits zero, poll every 5s until backend marks it ended
  useEffect(() => {
    if (!auction?.isLive) return;
    const msLeft = new Date(auction.endsAt) - new Date();
    if (msLeft <= 0) return;
    const timeout = setTimeout(() => {
      const fastPoll = setInterval(async () => {
        await loadAuction();
        setAuction((a) => {
          if (!a?.isLive) clearInterval(fastPoll);
          return a;
        });
      }, 5_000);
    }, msLeft);
    return () => clearTimeout(timeout);
  }, [auction?.endsAt, auction?.isLive, loadAuction]);

  useEffect(() => {
    if (user) {
      api.get(`/auctions/${id}/bids`).then((r) => setBids(r.data)).catch(() => {});
      api.get(`/watchlist/${id}/status`).then((r) => setWatching(r.data.watching)).catch(() => {});
    }
  }, [id, user]);

  async function handleBid(e) {
    e.preventDefault();
    if (!user) { navigate('/login'); return; }
    if (user.role !== 'Buyer') { toast.error('Only buyers can place bids.'); return; }

    setPlacing(true);
    try {
      const res = await api.post(`/auctions/${id}/bid`, { amount: parseFloat(bidAmount) });
      toast.success('Bid placed successfully!');
      if (res.data.sniped) {
        setSniped(true);
        setTimeout(() => setSniped(false), 8000);
      }
      const [aRes, bRes] = await Promise.all([api.get(`/auctions/${id}`), api.get(`/auctions/${id}/bids`)]);
      setAuction(aRes.data);
      setBids(bRes.data);
      setBidAmount(String((parseFloat(aRes.data.currentBid) + parseFloat(aRes.data.minimumIncrement)).toFixed(2)));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to place bid.');
    } finally {
      setPlacing(false);
    }
  }

  async function toggleWatch() {
    if (!user) { navigate('/login'); return; }
    setWatchLoading(true);
    try {
      if (watching) {
        await api.delete(`/watchlist/${id}`);
        setWatching(false);
        toast.success('Removed from watchlist.');
      } else {
        await api.post(`/watchlist/${id}`);
        setWatching(true);
        toast.success('Added to watchlist.');
      }
    } catch {
      toast.error('Failed to update watchlist.');
    } finally {
      setWatchLoading(false);
    }
  }

  if (loading) return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="h-80 bg-gray-200 rounded-xl animate-pulse" />
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 bg-gray-200 rounded animate-pulse" />
          <div className="h-24 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );

  if (!auction) return null;

  const ended = new Date(auction.endsAt) < new Date();
  const minBid = parseFloat(auction.currentBid) + parseFloat(auction.minimumIncrement);
  const conditionClass = CONDITION_COLORS[auction.condition] || CONDITION_COLORS['Not Specified'];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Anti-snipe banner */}
      {sniped && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm font-medium animate-pulse">
          <i className="bi bi-shield-check text-amber-500 text-lg" />
          Auction extended by {auction.antiSnipeMinutes} minute{auction.antiSnipeMinutes !== 1 ? 's' : ''} — a bid landed in the final window.
        </div>
      )}

      {/* Snipe extension indicator (persistent) */}
      {auction.snipeExtensions > 0 && !sniped && (
        <div className="mb-4 flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 px-4 py-2 rounded-xl text-xs">
          <i className="bi bi-clock-history" />
          This auction has been extended {auction.snipeExtensions} time{auction.snipeExtensions !== 1 ? 's' : ''} due to late bidding.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        {/* Image */}
        <div>
          <img
            src={auction.imageUrl}
            alt={auction.title}
            className="w-full h-80 object-cover rounded-xl"
            onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800&q=80'; }}
          />
        </div>

        {/* Details */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              {/* Category + Condition badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{auction.category}</span>
                {auction.condition && auction.condition !== 'Not Specified' && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${conditionClass}`}>
                    {auction.condition}
                  </span>
                )}
                {auction.lotNumber && (
                  <span className="text-xs text-gray-400 font-mono">{auction.lotNumber}</span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mt-2">{auction.title}</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {auction.isLive && !ended ? (
                <span className="badge-live"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Live</span>
              ) : ended ? (
                <span className="badge-ended">Ended</span>
              ) : auction.status === 'preview' ? (
                <span className="text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">Preview</span>
              ) : null}
              {/* Watchlist button */}
              <button
                onClick={toggleWatch}
                disabled={watchLoading}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  watching
                    ? 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100'
                    : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                }`}
                title={watching ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                <i className={`bi ${watching ? 'bi-bookmark-fill' : 'bi-bookmark'}`} />
                {watching ? 'Watching' : 'Watch'}
              </button>
            </div>
          </div>

          <p className="text-gray-500 text-sm leading-relaxed">{auction.description}</p>

          {/* Bid info */}
          <div className="card p-4 bg-primary-50 border-primary-100">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500">Current Bid</p>
                <p className="text-xl font-bold text-primary-700">{formatRwf(parseFloat(auction.currentBid))}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Bids</p>
                <p className="text-xl font-bold text-gray-900">{auction.bidCount}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Time Left</p>
                {auction.isLive && !ended ? (
                  <Countdown endsAt={auction.endsAt} />
                ) : (
                  <p className="text-sm font-semibold text-gray-500">—</p>
                )}
              </div>
            </div>
          </div>

          {/* Reserve status — shown to buyers as a signal only */}
          {auction.hasReserve && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
              auction.reserveMet
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              <i className={`bi ${auction.reserveMet ? 'bi-check-circle' : 'bi-exclamation-circle'}`} />
              {auction.reserveMet ? 'Reserve price has been met' : 'Reserve price not yet met'}
            </div>
          )}

          {/* Min increment note */}
          <p className="text-xs text-gray-400">
            Minimum increment: {formatRwf(parseFloat(auction.minimumIncrement))} &bull; Next min. bid: {formatRwf(minBid)}
          </p>

          {/* Anti-snipe info */}
          {auction.isLive && !ended && auction.antiSnipeMinutes > 0 && (
            <p className="text-xs text-blue-600 flex items-center gap-1">
              <i className="bi bi-shield-check" />
              Anti-sniping active — bids in the final {auction.antiSnipeMinutes} min extend the auction.
            </p>
          )}

          {/* AI Bid Prediction — buyer insight */}
          {auction.isLive && !ended && (
            <BidPrediction
              category={auction.category}
              startingBid={auction.startingBid}
              durationDays={Math.max(
                1,
                Math.round(
                  (new Date(auction.endsAt) - new Date(auction.startsAt)) / (1000 * 60 * 60 * 24)
                )
              )}
              mode="buyer"
              currentBid={auction.currentBid}
            />
          )}

          {/* Place bid */}
          {auction.isLive && !ended && (
            <form onSubmit={handleBid} className="space-y-3">
              <div>
                <label className="label">Your Bid (RWF)</label>
                <input
                  type="number"
                  className="input"
                  min={minBid}
                  step="0.01"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  required
                />
              </div>
              {!user ? (
                <button type="button" onClick={() => navigate('/login')} className="btn-primary w-full justify-center">
                  <i className="bi bi-person" /> Login to Bid
                </button>
              ) : user.role !== 'Buyer' ? (
                <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  <i className="bi bi-info-circle" /> Only buyers can place bids.
                </p>
              ) : (
                <button type="submit" className="btn-primary w-full justify-center" disabled={placing}>
                  <i className="bi bi-hammer" /> {placing ? 'Placing...' : 'Place Bid'}
                </button>
              )}
            </form>
          )}

          {/* Preview state — coming soon */}
          {auction.status === 'preview' && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 text-sm text-purple-700">
              <i className="bi bi-calendar-event mr-2" />
              This auction opens for bidding on {new Date(auction.startsAt).toLocaleString()}.
              {user && (
                <span className="ml-1">
                  {watching ? 'You are watching this auction.' : 'Watch it to get notified when it goes live.'}
                </span>
              )}
            </div>
          )}

          {/* Winner / closed result */}
          {result && (
            result.winnerId ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 space-y-1">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                  <i className="bi bi-trophy-fill text-amber-500" />
                  Auction Won
                </p>
                <p className="text-gray-900 font-bold text-lg">{result.winnerName}</p>
                <p className="text-sm text-gray-600">
                  Winning bid: <span className="font-semibold text-primary-700">{formatRwf(result.winningBid)}</span>
                </p>
                <p className="text-xs text-gray-400">
                  Closed {new Date(result.closedAt).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600">
                <i className="bi bi-x-circle mr-2 text-gray-400" />
                This auction ended with no winner
                {auction.hasReserve && !auction.reserveMet ? ' (reserve price not met)' : ''}.
              </div>
            )
          )}

          <div className="text-xs text-gray-400 space-y-0.5">
            <p><i className="bi bi-person-circle mr-1" /> Seller: {auction.auctioneerName}</p>
            <p><i className="bi bi-calendar3 mr-1" /> Starts: {new Date(auction.startsAt).toLocaleString()}</p>
            <p><i className="bi bi-calendar-x mr-1" /> Ends: {new Date(auction.endsAt).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Bid history */}
      {user && bids.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Bid History</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Bidder</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Amount</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bids.map((b, i) => (
                  <tr key={b.id} className={i === 0 ? 'bg-green-50' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-3 font-medium text-gray-800">{b.bidder_name}</td>
                    <td className="px-4 py-3 text-primary-700 font-semibold">{formatRwf(parseFloat(b.amount))}</td>
                    <td className="px-4 py-3 text-gray-400">{new Date(b.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
