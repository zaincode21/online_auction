import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { formatRwf } from '../../utils/currency';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';

const STATUS_COLORS = {
  Live: '#10b981',
  Ended: '#6b7280',
  Pending: '#f59e0b',
};

function BidTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const bids = payload.find((p) => p.dataKey === 'bids')?.value ?? 0;
  const volume = payload.find((p) => p.dataKey === 'volume')?.value ?? 0;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm text-xs">
      <p className="font-semibold text-gray-800 mb-1">{label}</p>
      <p className="text-indigo-600">Bids: {bids}</p>
      <p className="text-amber-600">Volume: {formatRwf(volume)}</p>
    </div>
  );
}

function MoneyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm text-xs">
      <p className="font-semibold text-gray-800 mb-1">{row.name}</p>
      <p style={{ color: row.fill }}>{formatRwf(row.value)}</p>
    </div>
  );
}

function shortMoney(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(v);
}

export default function SellerDashboard() {
  const { user } = useAuth();
  const [auctions, setAuctions] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/auctions/seller/my'),
      api.get('/auctions/seller/analytics'),
    ])
      .then(([auctionsRes, analyticsRes]) => {
        setAuctions(auctionsRes.data);
        setAnalytics(analyticsRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const summary = analytics?.summary;
  const stats = [
    {
      label: 'Active Auctions',
      value: summary?.live ?? 0,
      icon: 'bi-hammer',
      color: 'text-green-600 bg-green-50',
    },
    {
      label: 'Total Bids Received',
      value: summary?.totalBids ?? 0,
      icon: 'bi-currency-exchange',
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Total Bid Value',
      value: formatRwf(summary?.totalBidValue ?? 0),
      icon: 'bi-cash-stack',
      color: 'text-purple-600 bg-purple-50',
    },
    {
      label: 'Seller Payout',
      value: formatRwf(summary?.totalPayout ?? 0),
      icon: 'bi-wallet2',
      color: 'text-emerald-600 bg-emerald-50',
    },
  ];

  const recent = [...auctions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const statusData = analytics?.statusBreakdown || [];
  const salesTotals = analytics?.salesTotals || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.fullName}</h1>
          <p className="text-gray-500 text-sm mt-0.5">Auction activity and analytics at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/seller/analytics" className="btn-secondary text-sm">
            <i className="bi bi-graph-up" /> Full Analytics
          </Link>
          <Link to="/seller/create-auction" className="btn-primary">
            <i className="bi bi-plus-circle" /> New Auction
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4">
            <h2 className="font-semibold text-gray-900">Bid activity (14 days)</h2>
            <p className="text-xs text-gray-400 mt-0.5">Bids placed on your auctions</p>
          </div>
          {loading ? (
            <div className="h-64 bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={analytics?.bidActivity || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={shortMoney}
                />
                <Tooltip content={<BidTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="bids" name="Bids" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={18} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="volume"
                  name="Volume (RWF)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5 space-y-6">
          <div>
            <h2 className="font-semibold text-gray-900 mb-1">Auction status</h2>
            <p className="text-xs text-gray-400 mb-3">Live / ended / pending</p>
            {loading ? (
              <div className="h-36 bg-gray-50 rounded-xl animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={statusData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {statusData.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-1">Sales & payout</h2>
            <p className="text-xs text-gray-400 mb-3">From closed auctions</p>
            {loading ? (
              <div className="h-36 bg-gray-50 rounded-xl animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={salesTotals} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={shortMoney} />
                  <Tooltip content={<MoneyTooltip />} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {salesTotals.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Recent auctions */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Auctions</h2>
          <Link to="/seller/my-auctions" className="text-sm text-primary-600 hover:underline">View all</Link>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : recent.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <i className="bi bi-hammer text-4xl block mb-2" />
            No auctions yet. <Link to="/seller/create-auction" className="text-primary-600 hover:underline">Create one</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Title</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Current Bid</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Bids</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recent.map((a) => {
                const ended = new Date(a.endsAt) < new Date();
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">{a.title}</td>
                    <td className="px-5 py-3 text-primary-700">{formatRwf(parseFloat(a.currentBid))}</td>
                    <td className="px-5 py-3 text-gray-500">{a.bidCount}</td>
                    <td className="px-5 py-3">
                      {a.isLive && !ended ? <span className="badge-live">Live</span>
                        : ended ? <span className="badge-ended">Ended</span>
                        : <span className="badge-pending">Pending</span>}
                    </td>
                    <td className="px-5 py-3">
                      <Link to={`/seller/auction/${a.id}`} className="text-primary-600 hover:underline text-xs">View</Link>
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
