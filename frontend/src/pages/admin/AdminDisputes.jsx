import { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [resolveForm, setResolveForm] = useState({ adminNote: '', status: 'Resolved' });
  const [resolving, setResolving] = useState(false);

  function load() {
    api.get('/disputes')
      .then((r) => setDisputes(r.data))
      .catch(() => toast.error('Failed.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function resolve(id) {
    setResolving(true);
    try {
      await api.post(`/disputes/${id}/resolve`, resolveForm);
      toast.success('Dispute resolved.');
      setSelected(null);
      load();
    } catch { toast.error('Failed.'); }
    finally { setResolving(false); }
  }

  const statusColors = {
    Open: 'bg-yellow-100 text-yellow-700',
    Resolved: 'bg-green-100 text-green-700',
    Closed: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Disputes</h1>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : disputes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <i className="bi bi-check-circle text-4xl block mb-2" />
            No disputes found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Title</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Raised By</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Auction</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Date</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {disputes.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">{d.title}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{d.raisedByName}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs max-w-xs truncate">{d.auctionTitle}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[d.status] || 'bg-gray-100 text-gray-600'}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{new Date(d.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    {d.status === 'Open' && (
                      <button onClick={() => { setSelected(d); setResolveForm({ adminNote: d.adminNote || '', status: 'Resolved' }); }}
                        className="text-xs text-primary-600 hover:underline">
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Resolve modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="font-bold text-lg text-gray-900">Resolve Dispute</h2>
            <p className="text-sm text-gray-500"><strong>{selected.title}</strong></p>
            <p className="text-sm text-gray-600 bg-gray-50 rounded p-3">{selected.description}</p>

            <div>
              <label className="label">Resolution Status</label>
              <select className="input" value={resolveForm.status} onChange={(e) => setResolveForm({...resolveForm, status: e.target.value})}>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="label">Admin Note</label>
              <textarea className="input min-h-[80px]" value={resolveForm.adminNote} onChange={(e) => setResolveForm({...resolveForm, adminNote: e.target.value})} placeholder="Explain the resolution..." />
            </div>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={() => setSelected(null)}>Cancel</button>
              <button className="btn-primary" onClick={() => resolve(selected.id)} disabled={resolving}>
                {resolving ? 'Resolving...' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
