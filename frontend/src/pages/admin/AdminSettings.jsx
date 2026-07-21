import { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function AdminSettings() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [edits, setEdits] = useState({});

  useEffect(() => {
    api.get('/admin/settings')
      .then((r) => {
        setSettings(r.data);
        const initial = {};
        r.data.forEach((s) => { initial[s.key] = s.value; });
        setEdits(initial);
      })
      .catch(() => toast.error('Failed.'))
      .finally(() => setLoading(false));
  }, []);

  async function save(key) {
    setSaving(key);
    try {
      await api.put(`/admin/settings/${key}`, { value: edits[key] });
      toast.success('Setting updated.');
      setSettings((prev) => prev.map((s) => s.key === key ? { ...s, value: edits[key] } : s));
    } catch { toast.error('Failed.'); }
    finally { setSaving(null); }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>

      {loading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-4">
          {settings.map((s) => (
            <div key={s.key} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{s.key}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.description}</p>
                  <p className="text-xs text-gray-400 mt-1">Last updated: {new Date(s.updated_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="input w-28 text-center"
                    value={edits[s.key] ?? s.value}
                    onChange={(e) => setEdits((p) => ({ ...p, [s.key]: e.target.value }))}
                  />
                  <button
                    onClick={() => save(s.key)}
                    className="btn-primary text-xs py-1.5"
                    disabled={saving === s.key || edits[s.key] === s.value}
                  >
                    {saving === s.key ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
