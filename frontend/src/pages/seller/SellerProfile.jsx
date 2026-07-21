import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function SellerProfile() {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [form, setForm] = useState({
    fullName: '', companyName: '', bio: '', address: '', profilePicture: null,
  });

  useEffect(() => {
    api.get('/users/profile')
      .then((r) => {
        setForm({
          fullName: r.data.fullName || '',
          companyName: r.data.companyName || '',
          bio: r.data.bio || '',
          address: r.data.address || '',
          profilePicture: null,
        });
      })
      .catch(() => toast.error('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  function handleChange(e) {
    const { name, value, files } = e.target;
    if (name === 'profilePicture' && files[0]) {
      setForm((f) => ({ ...f, profilePicture: files[0] }));
      setAvatarPreview(URL.createObjectURL(files[0]));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = new FormData();
      data.append('fullName', form.fullName);
      data.append('companyName', form.companyName);
      data.append('bio', form.bio);
      data.append('address', form.address);
      if (form.profilePicture) data.append('profilePicture', form.profilePicture);

      await api.put('/users/profile', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Profile updated.');
      await refreshUser(); // sync sidebar name without requiring re-login
    } catch {
      toast.error('Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-2xl font-bold overflow-hidden">
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
            ) : (
              (form.fullName?.[0] || user?.fullName?.[0] || 'U').toUpperCase()
            )}
          </div>
          <div>
            <label className="btn-secondary text-xs cursor-pointer">
              <i className="bi bi-camera" /> Change Photo
              <input name="profilePicture" type="file" accept="image/*" className="hidden" onChange={handleChange} />
            </label>
          </div>
        </div>

        <div>
          <label className="label">Full Name *</label>
          <input name="fullName" className="input" required value={form.fullName} onChange={handleChange} />
        </div>
        <div>
          <label className="label">Company Name</label>
          <input name="companyName" className="input" value={form.companyName} onChange={handleChange} />
        </div>
        <div>
          <label className="label">Bio</label>
          <textarea name="bio" className="input min-h-[80px] resize-y" value={form.bio} onChange={handleChange} placeholder="Tell buyers about yourself..." />
        </div>
        <div>
          <label className="label">Address</label>
          <input name="address" className="input" value={form.address} onChange={handleChange} />
        </div>

        <div className="pt-2">
          <p className="text-xs text-gray-400 mb-3">Email: <span className="font-medium text-gray-600">{user?.email}</span> &bull; Role: <span className="font-medium text-gray-600">{user?.role}</span></p>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
