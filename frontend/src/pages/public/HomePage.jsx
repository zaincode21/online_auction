import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import AuctionCard from '../../components/AuctionCard';

export default function HomePage() {
  const [featured, setFeatured] = useState([]);
  const [live, setLive] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState([
    { value: '—', label: 'Active Auctions', icon: 'bi-hammer' },
    { value: '—', label: 'Registered Users', icon: 'bi-people' },
    { value: '—', label: 'Total Bids Placed', icon: 'bi-cash' },
    { value: '—', label: 'Auctions Ended', icon: 'bi-trophy' },
  ]);

  useEffect(() => {
    async function load() {
      try {
        const [featuredRes, liveRes, catsRes, statsRes] = await Promise.all([
          api.get('/auctions?featured=true&limit=6').catch(() => ({ data: { auctions: [] } })),
          api.get('/auctions?limit=8').catch(() => ({ data: { auctions: [], total: 0 } })),
          api.get('/categories').catch(() => ({ data: [] })),
          api.get('/stats').catch(() => null),
        ]);
        setFeatured(featuredRes.data.auctions || []);
        setLive(liveRes.data.auctions || []);
        setCategories((catsRes.data || []).slice(0, 6));

        if (statsRes?.data) {
          setStats([
            { value: statsRes.data.liveAuctions.toLocaleString(), label: 'Active Auctions', icon: 'bi-hammer' },
            { value: statsRes.data.totalUsers.toLocaleString(), label: 'Registered Users', icon: 'bi-people' },
            { value: statsRes.data.totalBids.toLocaleString(), label: 'Total Bids Placed', icon: 'bi-cash' },
            { value: statsRes.data.endedAuctions.toLocaleString(), label: 'Auctions Completed', icon: 'bi-trophy' },
          ]);
        } else {
          const liveTotal = liveRes.data.total || 0;
          setStats((prev) => [
            { ...prev[0], value: liveTotal.toLocaleString() },
            prev[1],
            prev[2],
            prev[3],
          ]);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-900 via-primary-700 to-primary-500 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Live Auctions Happening Now
          </div>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
            Bid. Win. <span className="text-amber-400">Collect.</span>
          </h1>
          <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
            Discover unique items from trusted sellers worldwide. Real-time bidding, secure transactions, and unbeatable deals.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auctions" className="bg-amber-400 hover:bg-amber-500 text-gray-900 font-bold px-8 py-3 rounded-xl transition-colors flex items-center gap-2 justify-center">
              <i className="bi bi-hammer" /> Explore Auctions
            </Link>
            <Link to="/register" className="bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold px-8 py-3 rounded-xl transition-colors flex items-center gap-2 justify-center">
              <i className="bi bi-person-plus" /> Start Selling
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-3xl font-bold text-primary-600">{s.value}</div>
                <div className="flex items-center justify-center gap-1.5 text-sm text-gray-500 mt-1">
                  <i className={`bi ${s.icon}`} /> {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="py-12 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Browse by Category</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  to={`/auctions?category=${encodeURIComponent(cat.name)}`}
                  className="card p-4 text-center hover:border-primary-300 hover:shadow-md transition-all group"
                >
                  <i className={`bi ${cat.icon} text-2xl text-primary-500 group-hover:text-primary-700`} />
                  <div className="text-sm font-medium text-gray-700 mt-2">{cat.name}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Live Auctions */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Live Auctions</h2>
            <Link to="/auctions" className="text-primary-600 text-sm font-medium hover:underline flex items-center gap-1">
              View all <i className="bi bi-arrow-right" />
            </Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="card h-72 animate-pulse bg-gray-100" />
              ))}
            </div>
          ) : live.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <i className="bi bi-hammer text-5xl mb-3 block" />
              No live auctions at the moment.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {live.map((a) => <AuctionCard key={a.id} auction={a} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
