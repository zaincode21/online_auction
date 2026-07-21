import { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatRwf } from '../../utils/currency';

export default function AdminListings() {
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');

  function load() {
    api.get('/admin/auctions')
      .then((r) => setAuctions(r.data))
      .catch(() => toast.error('Failed to load listings.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function approve(id) {
    try {
      await api.post(`/admin/auctions/${id}/approve`);
      toast.success('Listing approved and live.');
      load();
    } catch { toast.error('Failed.'); }
  }

  async function reject(id) {
    if (!window.confirm('Reject and delete this listing?')) return;
    try {
      await api.delete(`/admin/auctions/${id}`);
      toast.success('Listing rejected.');
      setAuctions((p) => p.filter((a) => a.id !== id));
    } catch { toast.error('Failed.'); }
  }

  const pending = auctions.filter((a) => !a.is_live);
  const approved = auctions.filter((a) => a.is_live);
  const displayed = tab === 'pending' ? pending : approved;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Listing Approvals</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[['pending', `Pending (${pending.length})`], ['approved', `Approved (${approved.length})`]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTab(val)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <i className="bi bi-inbox text-4xl block mb-2" />
            No {tab} listings.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Title</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Category</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Seller</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Starting Bid</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Ends</th>
                {tab === 'pending' && <th className="text-left px-5 py-3 text-gray-400 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayed.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">{a.title}</td>
                  <td className="px-5 py-3 text-gray-500">{a.category}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{a.seller_name}</td>
                  <td className="px-5 py-3 text-primary-700">{formatRwf(parseFloat(a.starting_bid))}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{new Date(a.ends_at).toLocaleDateString()}</td>
                  {tab === 'pending' && (
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => approve(a.id)} className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded">Approve</button>
                        <button onClick={() => reject(a.id)} className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded">Reject</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
