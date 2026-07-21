import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
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

export default function SellerAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auctions/seller/analytics')
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const s = data?.summary;

  const cards = s
    ? [
        { label: 'Total Auctions', value: s.totalAuctions, icon: 'bi-collection', color: 'text-indigo-600 bg-indigo-50' },
        { label: 'Live', value: s.live, icon: 'bi-broadcast', color: 'text-emerald-600 bg-emerald-50' },
        { label: 'Sold', value: s.soldCount, icon: 'bi-trophy', color: 'text-amber-600 bg-amber-50' },
        { label: 'Total Bids', value: s.totalBids, icon: 'bi-currency-exchange', color: 'text-blue-600 bg-blue-50' },
        { label: 'Bid Value', value: formatRwf(s.totalBidValue), icon: 'bi-graph-up', color: 'text-purple-600 bg-purple-50' },
        { label: 'Sales', value: formatRwf(s.totalSales), icon: 'bi-cash', color: 'text-teal-600 bg-teal-50' },
        { label: 'Your Payout', value: formatRwf(s.totalPayout), icon: 'bi-wallet2', color: 'text-green-600 bg-green-50' },
        { label: 'Commission', value: formatRwf(s.totalCommission), icon: 'bi-percent', color: 'text-orange-600 bg-orange-50' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Seller Analytics</h1>
          <p className="text-gray-500 text-sm mt-0.5">Performance across your listings, bids, and sales.</p>
        </div>
        <Link to="/seller/dashboard" className="btn-secondary text-sm">
          <i className="bi bi-arrow-left" /> Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading
          ? [...Array(8)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-100" />)
          : cards.map((c) => (
              <div key={c.label} className="card p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color}`}>
                  <i className={`bi ${c.icon}`} />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{c.value}</p>
                  <p className="text-xs text-gray-500">{c.label}</p>
                </div>
              </div>
            ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-1">Bid activity (14 days)</h2>
          <p className="text-xs text-gray-400 mb-4">Daily bids and volume on your auctions</p>
          {loading ? (
            <div className="h-72 bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data?.bidActivity || []}>
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
                <Bar yAxisId="left" dataKey="bids" name="Bids" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
                <Line yAxisId="right" type="monotone" dataKey="volume" name="Volume (RWF)" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Auction status</h2>
          <p className="text-xs text-gray-400 mb-4">How your listings break down</p>
          {loading ? (
            <div className="h-72 bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.statusBreakdown || []} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {(data?.statusBreakdown || []).map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Sales & payout</h2>
          <p className="text-xs text-gray-400 mb-4">Closed auction money flow</p>
          {loading ? (
            <div className="h-64 bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data?.salesTotals || []} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={shortMoney} />
                  <Tooltip content={<MoneyTooltip />} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {(data?.salesTotals || []).map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Sales</span>
                  <span className="font-semibold">{formatRwf(s?.totalSales || 0)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Payout</span>
                  <span className="font-semibold text-emerald-600">{formatRwf(s?.totalPayout || 0)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Commission</span>
                  <span className="font-semibold text-amber-600">{formatRwf(s?.totalCommission || 0)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Buyer paid</span>
                  <span className="font-semibold text-sky-600">{formatRwf(s?.buyerPaid || 0)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Top auctions by bids</h2>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : !data?.topAuctions?.length ? (
            <div className="text-center py-12 text-gray-400 text-sm">No auction data yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Title</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Bids</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Current</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.topAuctions.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800 max-w-[180px] truncate">{a.title}</td>
                    <td className="px-5 py-3 text-gray-600">{a.bidCount}</td>
                    <td className="px-5 py-3 text-primary-700">{formatRwf(a.currentBid)}</td>
                    <td className="px-5 py-3">
                      <Link to={`/seller/auction/${a.id}`} className="text-xs text-primary-600 hover:underline">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
