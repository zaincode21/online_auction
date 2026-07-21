import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/NotificationBell';

const navItems = [
  { to: '/seller/dashboard', icon: 'bi-speedometer2', label: 'Dashboard' },
  { to: '/seller/analytics', icon: 'bi-graph-up', label: 'Analytics' },
  { to: '/seller/my-auctions', icon: 'bi-hammer', label: 'My Auctions' },
  { to: '/seller/create-auction', icon: 'bi-plus-circle', label: 'Create Auction' },
  { to: '/seller/profile', icon: 'bi-person', label: 'Profile' },
];

export default function SellerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-50">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-200">
          <i className="bi bi-hammer text-xl text-primary-600" />
          <span className="font-bold text-lg text-gray-900">GavelPro</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <i className={`bi ${item.icon} text-base`} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold">
              {user?.fullName?.[0]?.toUpperCase() || 'S'}
            </div>
            <div className="text-sm">
              <div className="font-medium text-gray-900">{user?.fullName}</div>
              <div className="text-gray-400 text-xs">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors px-2 py-1.5 rounded"
          >
            <i className="bi bi-box-arrow-right" /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 ml-64">
        <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-40">
          <div className="flex items-center justify-between">
            <h1 className="text-gray-900 font-semibold text-lg">Seller Portal</h1>
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
