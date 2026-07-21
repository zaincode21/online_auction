import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'Buyer',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);
    if (form.password !== form.confirmPassword) {
      setErrors([{ msg: 'Passwords do not match.' }]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/register', form);
      login(res.data.token, res.data.user);
      toast.success('Account created successfully!');
      if (res.data.user.role === 'Seller') navigate('/seller/dashboard');
      else navigate('/');
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) setErrors(data.errors);
      else toast.error(data?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="text-center mb-8">
            <i className="bi bi-person-plus text-4xl text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900 mt-2">Create account</h1>
            <p className="text-gray-500 text-sm mt-1">Join GavelPro and start bidding</p>
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-sm text-red-600">{e.msg}</p>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input
                type="text"
                className="input"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input
                type="password"
                className="input"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                required
                placeholder="Repeat password"
              />
            </div>
            <div>
              <label className="label">I am a...</label>
              <div className="flex gap-3">
                {['Buyer', 'Seller'].map((r) => (
                  <label
                    key={r}
                    className={`flex-1 flex items-center justify-center gap-2 border rounded-lg py-2.5 cursor-pointer transition-colors text-sm font-medium ${
                      form.role === r
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r}
                      checked={form.role === r}
                      onChange={() => setForm({ ...form, role: r })}
                      className="sr-only"
                    />
                    <i className={`bi ${r === 'Buyer' ? 'bi-bag' : 'bi-shop'}`} />
                    {r}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
