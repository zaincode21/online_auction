import { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function AdminCategories() {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', icon: 'bi-tag', description: '' });
  const [creating, setCreating] = useState(false);

  function load() {
    api.get('/categories?all=true')
      .then((r) => setCats(r.data))
      .catch(() => toast.error('Failed.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function create(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/categories', form);
      toast.success('Category created.');
      setForm({ name: '', icon: 'bi-tag', description: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed.');
    } finally {
      setCreating(false);
    }
  }

  async function toggle(id) {
    try {
      await api.post(`/categories/${id}/toggle`);
      load();
    } catch { toast.error('Failed.'); }
  }

  async function del(id) {
    if (!window.confirm('Delete this category?')) return;
    try {
      await api.delete(`/categories/${id}`);
      toast.success('Category deleted.');
      load();
    } catch { toast.error('Failed.'); }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Categories</h1>

      {/* Create form */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Add Category</h2>
        <form onSubmit={create} className="flex flex-col sm:flex-row gap-3">
          <input className="input" placeholder="Name *" required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
          <input className="input" placeholder="Icon class (e.g. bi-tag)" value={form.icon} onChange={(e) => setForm({...form, icon: e.target.value})} />
          <input className="input" placeholder="Description" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} />
          <button type="submit" className="btn-primary shrink-0" disabled={creating}>
            <i className="bi bi-plus-circle" /> {creating ? 'Adding...' : 'Add'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : cats.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No categories yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Icon</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Description</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cats.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3"><i className={`bi ${c.icon} text-primary-500 text-lg`} /></td>
                  <td className="px-5 py-3 font-medium text-gray-800">{c.name}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs max-w-xs truncate">{c.description}</td>
                  <td className="px-5 py-3">
                    {c.is_active
                      ? <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Active</span>
                      : <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactive</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => toggle(c.id)} className="text-xs text-blue-600 hover:underline">
                        {c.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => del(c.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
