import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const CONDITIONS = ['Not Specified', 'Mint', 'Excellent', 'Good', 'Fair', 'Poor', 'For Parts'];

export default function EditAuction() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [form, setForm] = useState({
    title: '', description: '', category: '', condition: 'Not Specified',
    startingBid: '', minimumIncrement: '', reservePrice: '',
    antiSnipeMinutes: '3', imageUrl: '', imageFile: null,
  });

  useEffect(() => {
    Promise.all([
      api.get(`/auctions/${id}`),
      api.get('/categories'),
    ]).then(([aRes, cRes]) => {
      const a = aRes.data;
      setForm({
        title: a.title,
        description: a.description,
        category: a.category,
        condition: a.condition || 'Not Specified',
        startingBid: a.startingBid,
        minimumIncrement: a.minimumIncrement,
        reservePrice: a.reservePrice != null ? a.reservePrice : '',
        antiSnipeMinutes: String(a.antiSnipeMinutes ?? 3),
        imageUrl: a.imageUrl,
        imageFile: null,
      });
      setCategories(cRes.data);
    }).catch(() => {
      toast.error('Failed to load auction.');
      navigate('/seller/my-auctions');
    }).finally(() => setLoading(false));
  }, [id, navigate]);

  function handleChange(e) {
    const { name, value, files } = e.target;
    if (name === 'imageFile' && files[0]) {
      setForm((f) => ({ ...f, imageFile: files[0] }));
      setImagePreview(URL.createObjectURL(files[0]));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.reservePrice && parseFloat(form.reservePrice) < parseFloat(form.startingBid)) {
      toast.error('Reserve price must be ≥ starting bid.');
      return;
    }
    setSaving(true);
    try {
      const data = new FormData();
      data.append('title', form.title);
      data.append('description', form.description);
      data.append('category', form.category);
      data.append('condition', form.condition);
      data.append('startingBid', form.startingBid);
      data.append('minimumIncrement', form.minimumIncrement);
      data.append('reservePrice', form.reservePrice || '');
      data.append('antiSnipeMinutes', form.antiSnipeMinutes);
      if (form.imageFile) data.append('imageFile', form.imageFile);
      else data.append('imageUrl', form.imageUrl);

      await api.put(`/auctions/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Auction updated.');
      navigate('/seller/my-auctions');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update auction.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="animate-pulse h-96 bg-gray-100 rounded-xl" />;

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Edit Auction</h1>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        <div>
          <label className="label">Title *</label>
          <input name="title" className="input" required maxLength={100} value={form.title} onChange={handleChange} />
        </div>
        <div>
          <label className="label">Description *</label>
          <textarea name="description" className="input min-h-[100px] resize-y" required value={form.description} onChange={handleChange} />
        </div>

        {/* Category + Condition */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Category *</label>
            <select name="category" className="input" required value={form.category} onChange={handleChange}>
              <option value="">Select a category</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Condition *</label>
            <select name="condition" className="input" value={form.condition} onChange={handleChange}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Starting Bid (RWF) *</label>
            <input name="startingBid" type="number" min="1" step="0.01" className="input" required value={form.startingBid} onChange={handleChange} />
          </div>
          <div>
            <label className="label">Minimum Increment (RWF) *</label>
            <input name="minimumIncrement" type="number" min="1" step="0.01" className="input" required value={form.minimumIncrement} onChange={handleChange} />
          </div>
        </div>

        {/* Reserve Price */}
        <div>
          <label className="label">
            Reserve Price (RWF)
            <span className="ml-1 text-xs font-normal text-gray-400">(optional — hidden from buyers)</span>
          </label>
          <input
            name="reservePrice"
            type="number"
            min={form.startingBid || 1}
            step="0.01"
            className="input"
            value={form.reservePrice}
            onChange={handleChange}
            placeholder="Leave blank for no reserve"
          />
        </div>

        {/* Anti-sniping */}
        <div>
          <label className="label">Anti-Sniping Extension</label>
          <select name="antiSnipeMinutes" className="input" value={form.antiSnipeMinutes} onChange={handleChange}>
            <option value="0">Disabled</option>
            <option value="2">2 minutes</option>
            <option value="3">3 minutes (recommended)</option>
            <option value="5">5 minutes</option>
            <option value="10">10 minutes</option>
          </select>
        </div>

        {/* Image */}
        <div>
          <label className="label">Image</label>
          <input name="imageFile" type="file" accept="image/*" className="input py-1.5 text-xs" onChange={handleChange} />
          <p className="text-xs text-gray-400 mt-1">Or update image URL:</p>
          <input name="imageUrl" type="url" className="input mt-1" value={form.imageUrl} onChange={handleChange} />
          {(imagePreview || form.imageUrl) && (
            <img src={imagePreview || form.imageUrl} alt="Preview" className="mt-3 h-40 w-full object-cover rounded-lg"
              onError={(e) => { e.target.style.display = 'none'; }} />
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/seller/my-auctions')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
