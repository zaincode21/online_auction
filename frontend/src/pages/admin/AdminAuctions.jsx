import { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatRwf } from '../../utils/currency';

export default function AdminAuctions() {
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  function load() {
    api.get('/admin/auctions')
      .then((r) => setAuctions(r.data))
      .catch(() => toast.error('Failed to load auctions.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function toggleLive(id) {
    try {
      await api.post(`/admin/auctions/${id}/toggle-live`);
      toast.success('Status updated.');
      load();
    } catch { toast.error('Failed.'); }
  }

  async function deleteAuction(id) {
    if (!window.confirm('Delete this auction?')) return;
    try {
      await api.delete(`/admin/auctions/${id}`);
      toast.success('Auction deleted.');
      setAuctions((p) => p.filter((a) => a.id !== id));
    } catch { toast.error('Failed.'); }
  }

  const filtered = auctions.filter(
    (a) => a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">All Auctions</h1>

      <div className="relative max-w-sm">
        <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-9" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Title</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Category</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Seller</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Current Bid</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((a) => {
                const ended = new Date(a.ends_at) < new Date();
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">{a.title}</td>
                    <td className="px-5 py-3 text-gray-500">{a.category}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{a.seller_name}</td>
                    <td className="px-5 py-3 text-primary-700 font-semibold">{formatRwf(parseFloat(a.current_bid))}</td>
                    <td className="px-5 py-3">
                      {a.is_live && !ended ? <span className="badge-live">Live</span>
                        : ended ? <span className="badge-ended">Ended</span>
                        : <span className="badge-pending">Pending</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleLive(a.id)} className="text-xs text-blue-600 hover:underline">
                          {a.is_live ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => deleteAuction(a.id)} className="text-xs text-red-500 hover:underline">Delete</button>
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
