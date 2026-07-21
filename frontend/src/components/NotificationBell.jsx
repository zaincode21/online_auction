import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const TYPE_ICON = {
  auction_won:     { icon: 'bi-trophy-fill',      color: 'text-amber-500' },
  auction_sold:    { icon: 'bi-check-circle-fill', color: 'text-emerald-500' },
  auction_no_sale: { icon: 'bi-inbox',             color: 'text-gray-400'  },
  outbid:          { icon: 'bi-arrow-up-circle',   color: 'text-red-500'   },
  default:         { icon: 'bi-bell-fill',          color: 'text-blue-500'  },
};

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const dropdownRef = useRef(null);
  const pollRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      // silently fail — bell should never crash the app
    }
  }, [user]);

  // Initial fetch + poll every 30s
  useEffect(() => {
    fetchNotifications();
    pollRef.current = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(pollRef.current);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
    } catch {}
  }

  async function handleNotificationClick(notification) {
    // Mark as read
    if (!notification.isRead) {
      try {
        await api.patch(`/notifications/${notification.id}/read`);
        setNotifications((prev) =>
          prev.map((n) => n.id === notification.id ? { ...n, isRead: true } : n)
        );
        setUnread((c) => Math.max(0, c - 1));
      } catch {}
    }

    // Navigate to auction if linked
    if (notification.auctionId) {
      setOpen(false);
      const path = user?.role === 'Seller'
        ? `/seller/auction/${notification.auctionId}`
        : `/auctions/${notification.auctionId}`;
      navigate(path);
    }
  }

  async function deleteNotification(e, id) {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {}
  }

  if (!user) return null;

  const { icon: defaultIcon, color: defaultColor } = TYPE_ICON.default;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <i className="bi bi-bell text-gray-600 text-lg" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white
                           text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100
                        z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-900 text-sm">Notifications</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-gray-400">
                <i className="bi bi-bell-slash text-3xl mb-2" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => {
                const meta = TYPE_ICON[n.type] || TYPE_ICON.default;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors
                      ${n.isRead ? 'hover:bg-gray-50' : 'bg-indigo-50 hover:bg-indigo-100'}`}
                  >
                    {/* Icon */}
                    <div className="mt-0.5 shrink-0">
                      <i className={`bi ${meta.icon} ${meta.color} text-base`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold leading-tight mb-0.5
                        ${n.isRead ? 'text-gray-700' : 'text-gray-900'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 leading-snug line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>

                    {/* Unread dot + delete */}
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1" />
                      )}
                      <button
                        onClick={(e) => deleteNotification(e, n.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors"
                        aria-label="Dismiss"
                      >
                        <i className="bi bi-x text-sm" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-2 text-center">
              <span className="text-xs text-gray-400">{notifications.length} notification{notifications.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
