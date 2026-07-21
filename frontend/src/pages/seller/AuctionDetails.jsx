import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import Countdown from '../../components/Countdown';
import { formatRwf } from '../../utils/currency';

export default function AuctionDetails() {
  const { id } = useParams();
  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/auctions/${id}`),
      api.get(`/auctions/${id}/bids`),
      api.get(`/auctions/${id}/result`).catch(() => null),
    ])
      .then(([aRes, bRes, rRes]) => {
        setAuction(aRes.data);
        setBids(bRes.data);
        setResult(rRes?.data ?? null);
      })
      .catch(() => toast.error('Failed to load auction details.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="animate-pulse h-96 bg-gray-100 rounded-xl" />;
  if (!auction) return null;

  const ended = new Date(auction.endsAt) < new Date() || auction.status === 'ended';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/seller/my-auctions" className="text-gray-400 hover:text-gray-600 text-sm">
          <i className="bi bi-arrow-left mr-1" />My Auctions
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700 truncate max-w-xs">{auction.title}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <img
          src={auction.imageUrl}
          alt={auction.title}
          className="w-full h-64 object-cover rounded-xl"
          onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800&q=80'; }}
        />
        <div className="card p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-bold text-gray-900">{auction.title}</h1>
            {auction.isLive && !ended ? <span className="badge-live">Live</span>
              : ended ? <span className="badge-ended">Ended</span>
              : <span className="badge-pending">Pending Approval</span>}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-primary-50 rounded-lg p-3">
              <p className="text-xl font-bold text-primary-700">{formatRwf(parseFloat(auction.currentBid))}</p>
              <p className="text-xs text-gray-500">Current Bid</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xl font-bold text-gray-900">{auction.bidCount}</p>
              <p className="text-xs text-gray-500">Total Bids</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              {auction.isLive && !ended ? (
                <>
                  <Countdown endsAt={auction.endsAt} />
                  <p className="text-xs text-gray-500">Remaining</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-gray-500">—</p>
                  <p className="text-xs text-gray-400">Time Left</p>
                </>
              )}
            </div>
          </div>

          <div className="text-xs text-gray-500 space-y-1">
            <p><span className="font-medium">Category:</span> {auction.category}</p>
            <p><span className="font-medium">Starting Bid:</span> {formatRwf(parseFloat(auction.startingBid))}</p>
            <p><span className="font-medium">Min. Increment:</span> {formatRwf(parseFloat(auction.minimumIncrement))}</p>
            <p><span className="font-medium">Starts:</span> {new Date(auction.startsAt).toLocaleString()}</p>
            <p><span className="font-medium">Ends:</span> {new Date(auction.endsAt).toLocaleString()}</p>
          </div>

          {!ended && (
            <Link to={`/seller/edit-auction/${auction.id}`} className="btn-secondary w-full justify-center text-sm">
              <i className="bi bi-pencil" /> Edit Auction
            </Link>
          )}
        </div>
      </div>

      {/* Winner + payout */}
      {result && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <i className="bi bi-trophy text-amber-500" />
            Auction Result
          </h2>
          {result.winnerId ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-amber-50 rounded-lg p-4">
                <p className="text-xs text-amber-700 mb-1">Winner</p>
                <p className="font-bold text-gray-900">{result.winnerName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{result.winnerEmail}</p>
              </div>
              <div className="bg-primary-50 rounded-lg p-4">
                <p className="text-xs text-primary-600 mb-1">Winning Bid</p>
                <p className="text-xl font-bold text-primary-700">{formatRwf(result.winningBid)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Commission ({result.commissionRate}%)</p>
                <p className="text-xl font-bold text-gray-800">{formatRwf(result.commissionAmount)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-4">
                <p className="text-xs text-emerald-700 mb-1">Your Payout</p>
                <p className="text-xl font-bold text-emerald-700">{formatRwf(result.sellerPayout)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              <i className="bi bi-x-circle mr-1 text-gray-400" />
              Closed with no winner
              {auction.hasReserve && !auction.reserveMet ? ' — reserve price was not met.' : '.'}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Closed {new Date(result.closedAt).toLocaleString()}
          </p>
        </div>
      )}

      {/* Bid History */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Bid History ({bids.length})</h2>
        </div>
        {bids.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <i className="bi bi-currency-exchange text-3xl block mb-2" />
            No bids yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">#</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Bidder</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Amount</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bids.map((b, i) => (
                <tr key={b.id} className={i === 0 ? 'bg-green-50' : 'hover:bg-gray-50'}>
                  <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-5 py-3 font-medium text-gray-800">{b.bidder_name}</td>
                  <td className="px-5 py-3 font-bold text-primary-700">{formatRwf(parseFloat(b.amount))}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{new Date(b.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
