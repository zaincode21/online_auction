import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { formatRwf } from '../../utils/currency';

const STATUS_COLORS = {
  unpaid: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-700',
  pending: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
};

export default function BuyerDashboard() {
  const { user } = useAuth();
  const [bids, setBids] = useState([]);
  const [wonAuctions, setWonAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payItem, setPayItem] = useState(null);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [paying, setPaying] = useState(false);

  async function load() {
    try {
      const [bidsRes, wonRes] = await Promise.all([
        api.get('/users/my-bids'),
        api.get('/users/won-auctions'),
      ]);
      setBids(bidsRes.data);
      setWonAuctions(wonRes.data);
    } catch {
      toast.error('Failed to load your activity.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openPay(a) {
    setPayItem(a);
    setPhone('');
    const remaining = parseFloat(a.remaining ?? a.amountDue ?? a.winningBid ?? 0);
    // Prefill full remaining so one click pays in full
    setAmount(String(remaining));
  }

  async function submitPay(e) {
    e.preventDefault();
    if (!payItem) return;
    setPaying(true);
    try {
      const remaining = parseFloat(payItem.remaining ?? payItem.amountDue ?? payItem.winningBid ?? 0);
      const payAmount = parseFloat(amount) || remaining;
      const res = await api.post(`/payments/${payItem.id}/pay`, {
        phone,
        amount: payAmount,
      });
      toast.success(res.data.message || 'Payment completed.');
      if (res.data.referenceId) {
        toast('Ref: ' + res.data.referenceId, { icon: 'ℹ️' });
      }
      setPayItem(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment failed.');
    } finally {
      setPaying(false);
    }
  }

  const activeBids = bids.filter((b) => b.isLive && new Date(b.endsAt) > new Date());
  const totalSpent = wonAuctions.reduce((s, a) => s + parseFloat(a.amountPaid || 0), 0);
  const totalOwed = wonAuctions.reduce((s, a) => s + parseFloat(a.remaining || 0), 0);

  const stats = [
    { label: 'Active Bids', value: activeBids.length, icon: 'bi-hammer', color: 'text-green-600 bg-green-50' },
    { label: 'Auctions Won', value: wonAuctions.length, icon: 'bi-trophy', color: 'text-amber-600 bg-amber-50' },
    { label: 'Still to Pay', value: formatRwf(totalOwed), icon: 'bi-cash-stack', color: 'text-red-600 bg-red-50' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
          <p className="text-gray-500 text-sm mt-0.5">Welcome back, {user?.fullName}</p>
        </div>
        <Link to="/auctions" className="btn-primary">
          <i className="bi bi-hammer" /> Browse Auctions
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${s.color}`}>
              <i className={`bi ${s.icon}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{loading ? '—' : s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Won Auctions — always visible */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Auctions Won — Pay Here</h2>
          <p className="text-xs text-gray-400 mt-0.5">Amount due, remaining balance, and Mobile Money payment</p>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {[...Array(2)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : wonAuctions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <i className="bi bi-trophy text-4xl block mb-2" />
            <p>You haven&apos;t won any auctions yet.</p>
            <p className="text-xs mt-1">When you win, payment details and a Pay button appear here.</p>
            <Link to="/auctions" className="text-primary-600 hover:underline text-sm mt-2 inline-block">Browse auctions</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Auction</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Must Pay (80%)</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Paid</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Remaining</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {wonAuctions.map((a) => {
                  const status = a.paymentStatus || 'unpaid';
                  const canPay = status !== 'paid' && parseFloat(a.remaining || 0) > 0;
                  return (
                    <tr key={a.auctionId} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">{a.title}</td>
                      <td className="px-5 py-3 font-bold text-amber-600">{formatRwf(parseFloat(a.amountDue ?? a.winningBid))}</td>
                      <td className="px-5 py-3 text-emerald-700">{formatRwf(parseFloat(a.amountPaid || 0))}</td>
                      <td className="px-5 py-3 font-semibold text-red-600">{formatRwf(parseFloat(a.remaining ?? a.winningBid))}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-5 py-3 space-x-2">
                        {canPay && (
                          <button
                            type="button"
                            onClick={() => openPay(a)}
                            className="text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-lg"
                          >
                            Pay
                          </button>
                        )}
                        <Link to={`/auctions/${a.auctionId}`} className="text-xs text-primary-600 hover:underline">View</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* My Bids */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">My Bids</h2>
          <Link to="/auctions" className="text-sm text-primary-600 hover:underline">Find more auctions</Link>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : bids.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <i className="bi bi-hammer text-4xl block mb-2" />
            <p>You haven&apos;t placed any bids yet.</p>
            <Link to="/auctions" className="text-primary-600 hover:underline text-sm mt-1 inline-block">Browse auctions</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Auction</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Your Bid</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Current Bid</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Ends</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bids.map((b) => {
                const ended = new Date(b.endsAt) < new Date();
                const isWinning = parseFloat(b.myBid) >= parseFloat(b.currentBid);
                return (
                  <tr key={b.auctionId} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">{b.title}</td>
                    <td className="px-5 py-3 font-semibold text-primary-700">{formatRwf(parseFloat(b.myBid))}</td>
                    <td className="px-5 py-3 text-gray-600">{formatRwf(parseFloat(b.currentBid))}</td>
                    <td className="px-5 py-3">
                      {ended ? (
                        <span className="badge-ended">Ended</span>
                      ) : isWinning ? (
                        <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          <i className="bi bi-check-circle mr-1" />Winning
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                          <i className="bi bi-arrow-up-circle mr-1" />Outbid
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{new Date(b.endsAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      <Link to={`/auctions/${b.auctionId}`} className="text-xs text-primary-600 hover:underline">View</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pay modal */}
      {payItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={submitPay} className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="font-bold text-lg text-gray-900">Pay with Mobile Money</h2>
            <p className="text-sm text-gray-600">
              <strong>{payItem.title}</strong>
            </p>
            <p className="text-xs text-gray-500">
              Remaining: <strong className="text-red-600">{formatRwf(parseFloat(payItem.remaining))}</strong>
            </p>
            <div>
              <label className="label">MTN / Airtel phone number</label>
              <input
                type="tel"
                className="input"
                placeholder="078xxxxxxx or 25078xxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Amount to pay (RWF)</label>
              <input
                type="number"
                className="input"
                min="1"
                max={parseFloat(payItem.remaining)}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <button
                type="button"
                className="text-xs text-primary-600 hover:underline mt-1"
                onClick={() => setAmount(String(parseFloat(payItem.remaining)))}
              >
                Use full remaining
              </button>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className="btn-secondary text-sm" onClick={() => setPayItem(null)} disabled={paying}>
                Cancel
              </button>
              <button type="submit" className="btn-primary text-sm" disabled={paying}>
                {paying ? 'Processing...' : 'Pay Full Amount'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
