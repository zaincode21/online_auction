import { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  function loadUsers() {
    api.get('/users')
      .then((r) => setUsers(r.data))
      .catch(() => toast.error('Failed to load users.'))
      .finally(() => setLoading(false));
  }

  useEffect(loadUsers, []);

  async function suspend(id) {
    try {
      await api.post(`/users/${id}/suspend`);
      toast.success('User suspended.');
      loadUsers();
    } catch { toast.error('Failed.'); }
  }

  async function unsuspend(id) {
    try {
      await api.post(`/users/${id}/unsuspend`);
      toast.success('Suspension lifted.');
      loadUsers();
    } catch { toast.error('Failed.'); }
  }

  async function deleteUser(id) {
    if (!window.confirm('Permanently delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User deleted.');
      setUsers((p) => p.filter((u) => u.id !== id));
    } catch { toast.error('Failed to delete.'); }
  }

  const isSuspended = (u) => u.lockoutEnd && new Date(u.lockoutEnd) > new Date();

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.fullName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">User Management</h1>

      <div className="relative max-w-sm">
        <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-9" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Email</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Role</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Joined</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{u.fullName}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      u.role === 'Admin' ? 'bg-red-100 text-red-700'
                      : u.role === 'Seller' ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                    }`}>{u.role}</span>
                  </td>
                  <td className="px-5 py-3">
                    {isSuspended(u) ? (
                      <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Suspended</span>
                    ) : (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Active</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {isSuspended(u) ? (
                        <button onClick={() => unsuspend(u.id)} className="text-xs text-green-600 hover:underline">Unsuspend</button>
                      ) : (
                        <button onClick={() => suspend(u.id)} className="text-xs text-amber-600 hover:underline">Suspend</button>
                      )}
                      <button onClick={() => deleteUser(u.id)} className="text-xs text-red-500 hover:underline">Delete</button>
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
