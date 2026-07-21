import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { formatRwf } from '../../utils/currency';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Cell,
} from 'recharts';

const PAYMENT_COLORS = {
  due: '#6366f1',
  paid: '#10b981',
  remaining: '#ef4444',
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

function PaymentTooltip({ active, payload }) {
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

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/admin/dashboard')
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = data ? [
    { label: 'Total Users', value: data.totalUsers, icon: 'bi-people', color: 'text-blue-600 bg-blue-50', link: '/admin/users' },
    { label: 'Buyers', value: data.totalBuyers, icon: 'bi-bag', color: 'text-green-600 bg-green-50' },
    { label: 'Sellers', value: data.totalSellers, icon: 'bi-shop', color: 'text-purple-600 bg-purple-50' },
    { label: 'Suspended', value: data.suspendedUsers, icon: 'bi-person-dash', color: 'text-red-600 bg-red-50' },
    { label: 'Total Auctions', value: data.totalAuctions, icon: 'bi-hammer', color: 'text-indigo-600 bg-indigo-50', link: '/admin/auctions' },
    { label: 'Live Auctions', value: data.liveAuctions, icon: 'bi-broadcast', color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Total Bids', value: data.totalBids, icon: 'bi-currency-exchange', color: 'text-amber-600 bg-amber-50' },
    { label: 'Total Bid Value', value: formatRwf(parseFloat(data.totalBidValue)), icon: 'bi-cash', color: 'text-teal-600 bg-teal-50' },
  ] : [];

  const paymentChart = data?.paymentTotals
    ? [
        { name: 'Due', value: data.paymentTotals.due, fill: PAYMENT_COLORS.due },
        { name: 'Paid', value: data.paymentTotals.paid, fill: PAYMENT_COLORS.paid },
        { name: 'Remaining', value: data.paymentTotals.remaining, fill: PAYMENT_COLORS.remaining },
      ]
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          [...Array(8)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-100" />)
        ) : stats.map((s) => (
          <div key={s.label} className={`card p-4 ${s.link ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}
            onClick={() => s.link && navigate(s.link)}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                <i className={`bi ${s.icon}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">Bid activity (14 days)</h2>
              <p className="text-xs text-gray-400 mt-0.5">Daily bid count and volume</p>
            </div>
          </div>
          {loading ? (
            <div className="h-64 bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={data?.bidActivity || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
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

        <div className="card p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-gray-900">Payment totals</h2>
            <p className="text-xs text-gray-400 mt-0.5">Buyer amounts due vs paid</p>
          </div>
          {loading ? (
            <div className="h-64 bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={paymentChart} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  />
                  <Tooltip content={<PaymentTooltip />} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {paymentChart.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Due</span>
                  <span className="font-semibold text-indigo-600">{formatRwf(data?.paymentTotals?.due || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Paid</span>
                  <span className="font-semibold text-emerald-600">{formatRwf(data?.paymentTotals?.paid || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Remaining</span>
                  <span className="font-semibold text-red-600">{formatRwf(data?.paymentTotals?.remaining || 0)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent Users */}
      {!loading && data?.recentUsers?.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Users</h2>
            <Link to="/admin/users" className="text-sm text-primary-600 hover:underline">View all</Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Email</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Role</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.recentUsers.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{u.fullName}</td>
                  <td className="px-5 py-3 text-gray-500">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      u.role === 'Admin' ? 'bg-red-100 text-red-700'
                      : u.role === 'Seller' ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                    }`}>{u.role}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
