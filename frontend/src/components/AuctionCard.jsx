import { Link } from 'react-router-dom';
import Countdown from './Countdown';
import { formatRwf } from '../utils/currency';

const CONDITION_DOT = {
  Mint: 'bg-emerald-500',
  Excellent: 'bg-blue-500',
  Good: 'bg-indigo-400',
  Fair: 'bg-amber-400',
  Poor: 'bg-orange-500',
  'For Parts': 'bg-red-500',
  'Not Specified': 'bg-gray-400',
};

export default function AuctionCard({ auction }) {
  const now = new Date();
  const ended = new Date(auction.endsAt) < now;
  const isPreview = auction.status === 'preview';

  return (
    <Link to={`/auctions/${auction.id}`} className="card overflow-hidden hover:shadow-md transition-shadow group block">
      <div className="relative h-44 overflow-hidden bg-gray-100">
        <img
          src={auction.imageUrl || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800&q=80'}
          alt={auction.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800&q=80'; }}
        />
        {/* Status badge */}
        <div className="absolute top-2 left-2">
          {auction.isLive && !ended ? (
            <span className="badge-live"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Live</span>
          ) : ended ? (
            <span className="badge-ended">Ended</span>
          ) : isPreview ? (
            <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Coming Soon</span>
          ) : (
            <span className="badge-pending">Pending</span>
          )}
        </div>
        {/* Featured badge */}
        {auction.isFeatured && (
          <div className="absolute top-2 right-2">
            <span className="bg-amber-400 text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full">Featured</span>
          </div>
        )}
        {/* Reserve not met indicator */}
        {auction.hasReserve && !auction.reserveMet && auction.isLive && !ended && (
          <div className="absolute bottom-2 right-2">
            <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">
              Reserve not met
            </span>
          </div>
        )}
      </div>

      <div className="p-4">
        {/* Category + condition */}
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs text-primary-600 font-medium">{auction.category}</p>
          {auction.condition && auction.condition !== 'Not Specified' && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className={`w-1.5 h-1.5 rounded-full ${CONDITION_DOT[auction.condition] || 'bg-gray-400'}`} />
              {auction.condition}
            </span>
          )}
          {auction.lotNumber && (
            <span className="text-xs font-mono text-gray-400 ml-auto">{auction.lotNumber}</span>
          )}
        </div>

        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 leading-snug mb-3">{auction.title}</h3>

        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-xs text-gray-400">{isPreview ? 'Starting Bid' : 'Current Bid'}</p>
            <p className="font-bold text-gray-900">
              {formatRwf(parseFloat(isPreview ? auction.startingBid || auction.currentBid : auction.currentBid))}
            </p>
          </div>
          <div className="text-right">
            {isPreview ? (
              <p className="text-xs text-purple-600">
                <i className="bi bi-clock mr-1" />
                {new Date(auction.startsAt).toLocaleDateString()}
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-400">{auction.bidCount} bid{auction.bidCount !== 1 ? 's' : ''}</p>
                {auction.isLive && !ended && <Countdown endsAt={auction.endsAt} />}
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
