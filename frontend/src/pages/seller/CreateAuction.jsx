import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import BidPrediction from '../../components/BidPrediction';

const CONDITIONS = ['Not Specified', 'Mint', 'Excellent', 'Good', 'Fair', 'Poor', 'For Parts'];

function toLocalInput(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function CreateAuction() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    condition: 'Not Specified',
    startingBid: '',
    minimumIncrement: '',
    reservePrice: '',
    antiSnipeMinutes: '3',
    startsAt: toLocalInput(new Date()),
    endsAt: toLocalInput(new Date(Date.now() + 7 * 24 * 3600000)),
    imageUrl: '',
    imageFile: null,
  });

  const durationDays = useMemo(() => {
    const start = new Date(form.startsAt);
    const end = new Date(form.endsAt);
    const diff = (end - start) / (1000 * 60 * 60 * 24);
    return isNaN(diff) || diff <= 0 ? 7 : Math.round(diff);
  }, [form.startsAt, form.endsAt]);

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data)).catch(() => {});
  }, []);

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
    setLoading(true);
    try {
      const data = new FormData();
      data.append('title', form.title);
      data.append('description', form.description);
      data.append('category', form.category);
      data.append('condition', form.condition);
      data.append('startingBid', form.startingBid);
      data.append('minimumIncrement', form.minimumIncrement);
      if (form.reservePrice) data.append('reservePrice', form.reservePrice);
      data.append('antiSnipeMinutes', form.antiSnipeMinutes);
      data.append('startsAt', new Date(form.startsAt).toISOString());
      data.append('endsAt', new Date(form.endsAt).toISOString());
      if (form.imageFile) data.append('imageFile', form.imageFile);
      else if (form.imageUrl) data.append('imageUrl', form.imageUrl);

      await api.post('/auctions', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Auction created and submitted for approval.');
      navigate('/seller/my-auctions');
    } catch (err) {
      const errors = err.response?.data?.errors;
      if (errors) errors.forEach((e) => toast.error(e.msg));
      else toast.error(err.response?.data?.message || 'Failed to create auction.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Create New Auction</h1>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Title */}
        <div>
          <label className="label">Title *</label>
          <input name="title" className="input" required maxLength={100} value={form.title} onChange={handleChange} placeholder="e.g. Vintage Rolex Submariner" />
        </div>

        {/* Description */}
        <div>
          <label className="label">Description *</label>
          <textarea name="description" className="input min-h-[100px] resize-y" required value={form.description} onChange={handleChange} placeholder="Describe the item, its condition, and any notable details." />
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

        {/* Bids */}
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
          {form.reservePrice && parseFloat(form.reservePrice) > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              <i className="bi bi-lock mr-1" />
              Buyers will only see "Reserve not yet met" — the actual amount stays private.
            </p>
          )}
        </div>

        {/* AI Bid Prediction */}
        {form.category && form.startingBid && (
          <BidPrediction
            category={form.category}
            startingBid={form.startingBid}
            durationDays={durationDays}
            mode="seller"
          />
        )}

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Start Time *</label>
            <input name="startsAt" type="datetime-local" className="input" required value={form.startsAt} onChange={handleChange} />
          </div>
          <div>
            <label className="label">End Time *</label>
            <input name="endsAt" type="datetime-local" className="input" required value={form.endsAt} onChange={handleChange} />
          </div>
        </div>

        {/* Anti-sniping */}
        <div>
          <label className="label">
            Anti-Sniping Extension
            <span className="ml-1 text-xs font-normal text-gray-400">(extend auction if bid lands in final window)</span>
          </label>
          <select name="antiSnipeMinutes" className="input" value={form.antiSnipeMinutes} onChange={handleChange}>
            <option value="0">Disabled</option>
            <option value="2">2 minutes</option>
            <option value="3">3 minutes (recommended)</option>
            <option value="5">5 minutes</option>
            <option value="10">10 minutes</option>
          </select>
          {parseInt(form.antiSnipeMinutes) > 0 && (
            <p className="text-xs text-blue-600 mt-1">
              <i className="bi bi-shield-check mr-1" />
              If a bid comes in within the last {form.antiSnipeMinutes} min, the auction extends by {form.antiSnipeMinutes} min.
            </p>
          )}
        </div>

        {/* Image */}
        <div>
          <label className="label">Image</label>
          <div className="space-y-2">
            <input name="imageFile" type="file" accept="image/*" className="input py-1.5 text-xs" onChange={handleChange} />
            <p className="text-xs text-gray-400">Or provide an image URL:</p>
            <input name="imageUrl" type="url" className="input" value={form.imageUrl} onChange={handleChange} placeholder="https://..." />
          </div>
          {imagePreview && (
            <img src={imagePreview} alt="Preview" className="mt-3 h-40 w-full object-cover rounded-lg" />
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Auction'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/seller/my-auctions')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
