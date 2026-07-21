import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatRwf } from '../../utils/currency';

const STATUS_COLORS = {
  unpaid: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-700',
  pending: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
};

export default function AdminPayments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [amountPaid, setAmountPaid] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    const qs = filter ? `?status=${filter}` : '';
    api.get(`/admin/payments${qs}`)
      .then((r) => setPayments(r.data))
      .catch(() => toast.error('Failed to load payments.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [filter]);

  function openEdit(p) {
    setEditing(p);
    setAmountPaid(String(p.amountPaid ?? 0));
  }

  async function savePayment({ markPaid } = {}) {
    if (!editing) return;
    setSaving(true);
    try {
      await api.patch(`/admin/payments/${editing.id}`, markPaid
        ? { markPaid: true }
        : { amountPaid: parseFloat(amountPaid) });
      toast.success(markPaid ? 'Marked as paid.' : 'Payment updated.');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed.');
    } finally {
      setSaving(false);
    }
  }

  const totals = payments.reduce(
    (acc, p) => {
      acc.due += p.amountDue;
      acc.paid += p.amountPaid;
      acc.remaining += p.remaining;
      return acc;
    },
    { due: 0, paid: 0, remaining: 0 }
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Winner Payments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Who won, how much they owe, remaining balance, and status</p>
        </div>
        <select
          className="input w-auto text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {!loading && payments.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-xs text-gray-500">Total Due</p>
            <p className="text-xl font-bold text-gray-900">{formatRwf(totals.due)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500">Total Paid</p>
            <p className="text-xl font-bold text-emerald-700">{formatRwf(totals.paid)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500">Remaining</p>
            <p className="text-xl font-bold text-red-600">{formatRwf(totals.remaining)}</p>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <i className="bi bi-cash-stack text-4xl block mb-2" />
            No winner payments found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Winner</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Auction</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Must Pay (80%)</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Paid</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Remaining</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Closed</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">{p.winnerName || '—'}</p>
                      <p className="text-xs text-gray-400">{p.winnerEmail}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-600 max-w-[180px] truncate">
                      <Link to={`/auctions/${p.auctionId}`} className="hover:text-primary-600 hover:underline">
                        {p.auctionTitle}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-semibold text-gray-900">{formatRwf(p.amountDue)}</td>
                    <td className="px-5 py-3 text-emerald-700">{formatRwf(p.amountPaid)}</td>
                    <td className="px-5 py-3 font-semibold text-red-600">{formatRwf(p.remaining)}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[p.paymentStatus] || 'bg-gray-100 text-gray-600'}`}>
                        {p.paymentStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{new Date(p.closedAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      {p.paymentStatus !== 'paid' && (
                        <button
                          onClick={() => openEdit(p)}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          Update
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="font-bold text-lg text-gray-900">Record Payment</h2>
            <p className="text-sm text-gray-600">
              <strong>{editing.winnerName}</strong> — {editing.auctionTitle}
            </p>
            <p className="text-xs text-gray-500">
              Must pay: <strong>{formatRwf(editing.amountDue)}</strong>
              {' · '}Remaining: <strong>{formatRwf(editing.remaining)}</strong>
            </p>
            <div>
              <label className="label">Amount Paid (total)</label>
              <input
                type="number"
                className="input"
                min="0"
                max={editing.amountDue}
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary text-sm" onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn-secondary text-sm" onClick={() => savePayment({ markPaid: true })} disabled={saving}>
                Mark Fully Paid
              </button>
              <button type="button" className="btn-primary text-sm" onClick={() => savePayment()} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
