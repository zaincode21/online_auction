import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Layouts
import PublicLayout from './layouts/PublicLayout';
import AdminLayout from './layouts/AdminLayout';
import SellerLayout from './layouts/SellerLayout';

// Public pages
import HomePage from './pages/public/HomePage';
import AuctionsPage from './pages/public/AuctionsPage';
import AuctionDetailPage from './pages/public/AuctionDetailPage';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// Seller pages
import SellerDashboard from './pages/seller/SellerDashboard';
import SellerAnalytics from './pages/seller/SellerAnalytics';
import MyAuctions from './pages/seller/MyAuctions';
import CreateAuction from './pages/seller/CreateAuction';
import EditAuction from './pages/seller/EditAuction';
import SellerProfile from './pages/seller/SellerProfile';
import AuctionDetails from './pages/seller/AuctionDetails';

// Buyer pages
import BuyerDashboard from './pages/buyer/BuyerDashboard';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminAuctions from './pages/admin/AdminAuctions';
import AdminListings from './pages/admin/AdminListings';
import AdminCategories from './pages/admin/AdminCategories';
import AdminDisputes from './pages/admin/AdminDisputes';
import AdminSettings from './pages/admin/AdminSettings';
import AdminReports from './pages/admin/AdminReports';
import AdminPayments from './pages/admin/AdminPayments';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/access-denied" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/auctions" element={<AuctionsPage />} />
        <Route path="/auctions/:id" element={<AuctionDetailPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/access-denied" element={<AccessDenied />} />
      </Route>

      {/* Buyer */}
      <Route
        path="/buyer"
        element={
          <ProtectedRoute roles={['Buyer']}>
            <PublicLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/buyer/dashboard" replace />} />
        <Route path="dashboard" element={<BuyerDashboard />} />
      </Route>

      {/* Seller */}
      <Route
        path="/seller"
        element={
          <ProtectedRoute roles={['Seller', 'Admin']}>
            <SellerLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/seller/dashboard" replace />} />
        <Route path="dashboard" element={<SellerDashboard />} />
        <Route path="analytics" element={<SellerAnalytics />} />
        <Route path="my-auctions" element={<MyAuctions />} />
        <Route path="create-auction" element={<CreateAuction />} />
        <Route path="edit-auction/:id" element={<EditAuction />} />
        <Route path="profile" element={<SellerProfile />} />
        <Route path="auction/:id" element={<AuctionDetails />} />
      </Route>

      {/* Admin */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['Admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="auctions" element={<AdminAuctions />} />
        <Route path="listings" element={<AdminListings />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="disputes" element={<AdminDisputes />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="reports" element={<AdminReports />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <i className="bi bi-shield-x text-6xl text-red-500" />
      <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
      <p className="text-gray-500">You don't have permission to view this page.</p>
      <a href="/" className="btn-primary">Go Home</a>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
