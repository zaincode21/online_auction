import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { formatRwf } from '../../utils/currency';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6'];

export default function AdminReports() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/reports')
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
    </div>
  );

  if (!data) return <p className="text-gray-500">Failed to load reports.</p>;

  const userStats = [
    { name: 'Buyers', value: data.totalBuyers },
    { name: 'Sellers', value: data.totalSellers },
    { name: 'Admins', value: data.totalAdmins },
  ];

  const auctionStats = [
    { name: 'Live', value: data.totalLiveAuctions },
    { name: 'Ended', value: data.totalEndedAuctions },
    { name: 'Pending', value: data.totalAuctions - data.totalLiveAuctions - data.totalEndedAuctions },
  ];

  const summaryCards = [
    { label: 'Total Users', value: data.totalUsers, icon: 'bi-people', color: 'text-blue-600 bg-blue-50' },
    { label: 'Total Auctions', value: data.totalAuctions, icon: 'bi-hammer', color: 'text-purple-600 bg-purple-50' },
    { label: 'Total Bids', value: data.totalBids, icon: 'bi-currency-exchange', color: 'text-green-600 bg-green-50' },
    { label: 'Total Bid Value', value: formatRwf(parseFloat(data.totalBidValue)), icon: 'bi-cash-stack', color: 'text-amber-600 bg-amber-50' },
    { label: 'Avg. Bid', value: formatRwf(parseFloat(data.averageBidAmount), { minimumFractionDigits: 2, maximumFractionDigits: 2 }), icon: 'bi-graph-up', color: 'text-teal-600 bg-teal-50' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Platform Reports</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {summaryCards.map((s) => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
              <i className={`bi ${s.icon}`} />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* User distribution */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">User Distribution</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={userStats} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[4,4,0,0]}>
                {userStats.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Auction status */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Auction Status</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={auctionStats} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[4,4,0,0]}>
                {auctionStats.map((_, i) => <Cell key={i} fill={COLORS[i+1]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top categories */}
      {data.topCategories.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Top 5 Categories</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.topCategories} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="categoryName" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="auctionCount" name="Auctions" radius={[4,4,0,0]}>
                {data.topCategories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 divide-y divide-gray-50">
            {data.topCategories.map((c) => (
              <div key={c.categoryName} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-gray-700">{c.categoryName}</span>
                <div className="flex gap-6 text-gray-500 text-xs">
                  <span>{c.auctionCount} auctions</span>
                  <span>{formatRwf(parseFloat(c.totalValue))} bid value</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
