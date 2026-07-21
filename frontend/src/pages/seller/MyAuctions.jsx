import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatRwf } from '../../utils/currency';

export default function MyAuctions() {
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);

  function loadAuctions() {
    api.get('/auctions/seller/my')
      .then((r) => setAuctions(r.data))
      .catch(() => toast.error('Failed to load auctions.'))
      .finally(() => setLoading(false));
  }

  useEffect(loadAuctions, []);

  async function handleDelete(id) {
    if (!window.confirm('Delete this auction? This cannot be undone.')) return;
    try {
      await api.delete(`/auctions/${id}`);
      toast.success('Auction deleted.');
      setAuctions((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete auction.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Auctions</h1>
        <Link to="/seller/create-auction" className="btn-primary">
          <i className="bi bi-plus-circle" /> New Auction
        </Link>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : auctions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <i className="bi bi-hammer text-5xl block mb-3" />
            <p className="font-medium">No auctions yet.</p>
            <Link to="/seller/create-auction" className="text-primary-600 hover:underline text-sm mt-1 inline-block">Create your first auction</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Lot</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Title</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Condition</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Current Bid</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Reserve</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Bids</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Ends</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {auctions.map((a) => {
                const ended = new Date(a.endsAt) < new Date();
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-400 font-mono text-xs">{a.lotNumber || '—'}</td>
                    <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">{a.title}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{a.condition || '—'}</td>
                    <td className="px-5 py-3 text-primary-700 font-semibold">{formatRwf(parseFloat(a.currentBid))}</td>
                    <td className="px-5 py-3 text-xs">
                      {a.reservePrice != null ? (
                        <span className={`px-2 py-0.5 rounded-full border text-xs ${
                          a.reserveMet
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {formatRwf(parseFloat(a.reservePrice))} {a.reserveMet ? '✓' : '—'}
                        </span>
                      ) : (
                        <span className="text-gray-400">None</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500">{a.bidCount}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{new Date(a.endsAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      {a.isLive && !ended ? <span className="badge-live">Live</span>
                        : ended ? <span className="badge-ended">Ended</span>
                        : a.status === 'preview' ? <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">Preview</span>
                        : <span className="badge-pending">Pending</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Link to={`/seller/auction/${a.id}`} className="text-xs text-primary-600 hover:underline">View</Link>
                        <Link to={`/seller/edit-auction/${a.id}`} className="text-xs text-gray-500 hover:text-gray-800">Edit</Link>
                        <button onClick={() => handleDelete(a.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
