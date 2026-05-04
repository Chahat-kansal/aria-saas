'use client';
import { useState, useEffect, useCallback } from 'react';

interface PosUser {
  id: string; name: string; role: string; is_active: boolean;
  last_login_at: string | null; created_at: string;
  permissions: {
    can_apply_discount: boolean;
    max_discount_pct: number;
    can_refund: boolean;
    can_close_register: boolean;
    can_override_price: boolean;
  };
}

const ROLE_COLORS: Record<string, string> = {
  cashier: 'bg-blue-100 text-blue-700',
  supervisor: 'bg-amber-100 text-amber-700',
  manager: 'bg-purple-100 text-purple-700',
  owner: 'bg-violet-100 text-violet-700',
};

const BLANK_FORM = { name: '', pin: '', role: 'cashier', can_apply_discount: true, can_refund: false, max_discount_pct: '10', can_close_register: false, can_override_price: false };

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<PosUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<PosUser | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => { if (d.business_id) setBusinessId(d.business_id); });
  }, []);

  const load = useCallback(async () => {
    if (!businessId) return;
    const d = await fetch(`/api/pos/users?business_id=${businessId}`).then(r => r.json());
    setUsers(d.users ?? []);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { if (businessId) load(); }, [businessId, load]);

  function openEdit(u: PosUser) {
    setEditUser(u);
    setForm({
      name: u.name, pin: '', role: u.role,
      can_apply_discount: u.permissions?.can_apply_discount ?? true,
      can_refund: u.permissions?.can_refund ?? false,
      max_discount_pct: String(u.permissions?.max_discount_pct ?? 10),
      can_close_register: u.permissions?.can_close_register ?? false,
      can_override_price: u.permissions?.can_override_price ?? false,
    });
    setShowAdd(true);
  }

  async function save() {
    if (!businessId || !form.name.trim()) return;
    if (!editUser && !/^\d{4}$/.test(form.pin)) { setPinError('PIN must be exactly 4 digits'); return; }
    if (form.pin && !/^\d{4}$/.test(form.pin)) { setPinError('PIN must be exactly 4 digits'); return; }
    setPinError('');
    setSaving(true);

    const permissions = {
      can_apply_discount: form.can_apply_discount,
      can_refund: form.can_refund,
      max_discount_pct: parseInt(form.max_discount_pct) || 10,
      can_close_register: form.can_close_register,
      can_override_price: form.can_override_price,
    };

    if (editUser) {
      const body: Record<string, unknown> = { business_id: businessId, name: form.name, role: form.role, permissions };
      if (form.pin) body.pin = form.pin;
      await fetch(`/api/pos/users/${editUser.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } else {
      await fetch('/api/pos/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: businessId, name: form.name, pin: form.pin, role: form.role, permissions }) });
    }

    setSaving(false);
    setShowAdd(false);
    setEditUser(null);
    setForm({ ...BLANK_FORM });
    load();
  }

  async function deactivate(id: string) {
    if (!businessId || !confirm('Deactivate this user?')) return;
    await fetch(`/api/pos/users/${id}?business_id=${businessId}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">POS Users & Permissions</h1>
          <p className="text-xs text-gray-500 mt-0.5">Staff PIN logins for the register</p>
        </div>
        <button onClick={() => { setShowAdd(true); setEditUser(null); setForm({ ...BLANK_FORM }); }}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ background: '#8B5CF6' }}>
          + Add user
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Add/Edit form */}
        {showAdd && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4">{editUser ? 'Edit user' : 'New user'}</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#8B5CF6]"
                  placeholder="Staff name" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  PIN {editUser ? '(leave blank to keep current)' : '(4 digits)'}
                </label>
                <input type="password" inputMode="numeric" maxLength={4} value={form.pin}
                  onChange={e => { setForm(f => ({ ...f, pin: e.target.value })); setPinError(''); }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#8B5CF6] font-mono tracking-widest"
                  placeholder="••••" />
                {pinError && <p className="text-xs text-red-500 mt-1">{pinError}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#8B5CF6] bg-white">
                  {['cashier','supervisor','manager','owner'].map(r => <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Max discount %</label>
                <input type="number" min="0" max="100" value={form.max_discount_pct}
                  onChange={e => setForm(f => ({ ...f, max_discount_pct: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#8B5CF6]" />
              </div>
            </div>
            <div className="space-y-2 mb-5">
              {[
                { key: 'can_apply_discount', label: 'Can apply discounts' },
                { key: 'can_refund', label: 'Can process refunds' },
                { key: 'can_close_register', label: 'Can close register' },
                { key: 'can_override_price', label: 'Can override prices' },
              ].map(p => (
                <label key={p.key} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={form[p.key as keyof typeof form] as boolean}
                    onChange={e => setForm(f => ({ ...f, [p.key]: e.target.checked }))}
                    className="w-4 h-4 accent-[#8B5CF6]" />
                  <span className="text-sm text-gray-700">{p.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={saving}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: '#8B5CF6' }}>
                {saving ? 'Saving…' : editUser ? 'Update user' : 'Create user'}
              </button>
              <button onClick={() => { setShowAdd(false); setEditUser(null); }} className="px-5 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-100">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* User list */}
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
        ) : users.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center shadow-sm">
            <p className="text-2xl mb-2">👤</p>
            <p className="text-gray-500 text-sm mb-3">No POS users yet</p>
            <p className="text-xs text-gray-400">Add staff so they can log in with a PIN at the register</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600 flex-shrink-0 text-sm">
                  {u.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-gray-900 text-sm">{u.name}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-500'}`}>{u.role}</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {u.last_login_at
                      ? `Last login: ${new Date(u.last_login_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                      : 'Never logged in'}
                    {' · '}Max discount: {u.permissions?.max_discount_pct ?? 0}%
                    {u.permissions?.can_refund && ' · Can refund'}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(u)}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                    Edit
                  </button>
                  <button onClick={() => deactivate(u.id)}
                    className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
