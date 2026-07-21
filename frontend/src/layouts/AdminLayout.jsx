import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/NotificationBell';

const navItems = [
  { to: '/admin/dashboard', icon: 'bi-speedometer2', label: 'Dashboard' },
  { to: '/admin/users', icon: 'bi-people', label: 'Users' },
  { to: '/admin/listings', icon: 'bi-card-list', label: 'Listings' },
  { to: '/admin/auctions', icon: 'bi-hammer', label: 'All Auctions' },
  { to: '/admin/categories', icon: 'bi-tags', label: 'Categories' },
  { to: '/admin/disputes', icon: 'bi-exclamation-triangle', label: 'Disputes' },
  { to: '/admin/payments', icon: 'bi-cash-coin', label: 'Payments' },
  { to: '/admin/reports', icon: 'bi-bar-chart', label: 'Reports' },
  { to: '/admin/settings', icon: 'bi-gear', label: 'Settings' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col fixed inset-y-0 left-0 z-50">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-700">
          <i className="bi bi-hammer text-xl text-primary-500" />
          <span className="font-bold text-lg">GavelPro Admin</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <i className={`bi ${item.icon} text-base`} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-sm font-bold">
              {user?.fullName?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="text-sm">
              <div className="font-medium">{user?.fullName}</div>
              <div className="text-gray-400 text-xs">Admin</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors px-2 py-1.5 rounded"
          >
            <i className="bi bi-box-arrow-right" /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 ml-64">
        <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-40">
          <div className="flex items-center justify-between">
            <h1 className="text-gray-900 font-semibold text-lg">Admin Panel</h1>
            <NotificationBell />
          </div>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
