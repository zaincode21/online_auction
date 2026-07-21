import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/NotificationBell';

export default function PublicLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 font-bold text-xl text-primary-600">
              <i className="bi bi-hammer text-2xl" />
              GavelPro
            </Link>
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
              <Link to="/" className="hover:text-primary-600 transition-colors">Home</Link>
              <Link to="/auctions" className="hover:text-primary-600 transition-colors">Auctions</Link>
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  {user.role === 'Admin' && (
                    <Link to="/admin/dashboard" className="btn-secondary text-xs py-1.5">
                      <i className="bi bi-shield-check" /> Admin
                    </Link>
                  )}
                  {(user.role === 'Seller' || user.role === 'Admin') && (
                    <Link to="/seller/dashboard" className="btn-secondary text-xs py-1.5">
                      <i className="bi bi-shop" /> Seller
                    </Link>
                  )}
                  {user.role === 'Buyer' && (
                    <Link to="/buyer/dashboard" className="btn-secondary text-xs py-1.5">
                      <i className="bi bi-person" /> My Account
                    </Link>
                  )}
                  <NotificationBell />
                  <button onClick={handleLogout} className="btn-danger text-xs py-1.5">
                    <i className="bi bi-box-arrow-right" /> Logout
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-secondary text-sm">Login</Link>
                  <Link to="/register" className="btn-primary text-sm">Register</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-2 text-white font-bold text-lg mb-2">
            <i className="bi bi-hammer" />
            GavelPro
          </div>
          <p className="text-sm">© {new Date().getFullYear()} GavelPro. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
