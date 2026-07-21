import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import AuctionCard from '../../components/AuctionCard';

export default function AuctionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [auctions, setAuctions] = useState([]);
  const [previewAuctions, setPreviewAuctions] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('live'); // 'live' | 'preview'

  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || '';
  const page = parseInt(searchParams.get('page') || '1');

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data)).catch(() => {});
    api.get('/auctions/preview').then((r) => setPreviewAuctions(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 12 });
    if (search) params.set('search', search);
    if (category) params.set('category', category);

    api
      .get(`/auctions?${params}`)
      .then((r) => {
        setAuctions(r.data.auctions);
        setTotal(r.data.total);
        setTotalPages(r.data.totalPages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, category, page]);

  function setParam(key, val) {
    const next = new URLSearchParams(searchParams);
    if (val) next.set(key, val);
    else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Auctions</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
        <button
          onClick={() => setTab('live')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'live' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Live Auctions
        </button>
        <button
          onClick={() => setTab('preview')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'preview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Coming Soon
          {previewAuctions.length > 0 && (
            <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
              {previewAuctions.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'preview' ? (
        /* ── Preview / upcoming auctions ── */
        previewAuctions.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <i className="bi bi-calendar-event text-5xl mb-4 block" />
            <p className="text-lg font-medium">No upcoming auctions right now.</p>
            <p className="text-sm">Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {previewAuctions.map((a) => <AuctionCard key={a.id} auction={a} />)}
          </div>
        )
      ) : (
        /* ── Live auctions ── */
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="input pl-9"
                placeholder="Search auctions..."
                defaultValue={search}
                onKeyDown={(e) => e.key === 'Enter' && setParam('search', e.target.value)}
              />
            </div>
            <select
              className="input w-full sm:w-56"
              value={category}
              onChange={(e) => setParam('category', e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          <p className="text-sm text-gray-500 mb-4">{total} auction{total !== 1 ? 's' : ''} found</p>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="card h-72 animate-pulse bg-gray-100" />
              ))}
            </div>
          ) : auctions.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <i className="bi bi-search text-5xl mb-4 block" />
              <p className="text-lg font-medium">No auctions found.</p>
              <p className="text-sm">Try adjusting your search or category filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {auctions.map((a) => <AuctionCard key={a.id} auction={a} />)}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('page', String(i + 1));
                    setSearchParams(next);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    page === i + 1
                      ? 'bg-primary-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
