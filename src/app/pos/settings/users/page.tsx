'use client';
import { useState, useEffect, useCallback } from 'react';

const C = { bg:'rgba(17,15,26,0.95)', card:'rgba(26,23,40,0.9)', border:'#2A2540', text:'#EDE8FF', muted:'#8B85A8', dim:'#4A4565', violet:'#8B5CF6', green:'#22C55E', red:'#EF4444', amber:'#F59E0B' };

const iCls: React.CSSProperties = { background: 'rgba(10,9,16,0.8)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: "'Manrope',sans-serif", width: '100%', boxSizing: 'border-box' };
const lCls: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' };

interface PosUser {
  id: string; name: string; role: string; is_active: boolean;
  last_login_at: string | null; created_at: string;
  permissions: {
    can_apply_discount?: boolean;
    max_discount_pct?: number;
    can_refund?: boolean;
    can_close_register?: boolean;
    can_override_price?: boolean;
    can_void?: boolean;
    can_view_reports?: boolean;
    can_edit_products?: boolean;
    can_open_register?: boolean;
  };
}

const ROLES = ['cashier', 'supervisor', 'manager', 'admin', 'owner'];

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  cashier:    { bg: 'rgba(59,130,246,0.15)',  color: '#60A5FA' },
  supervisor: { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  manager:    { bg: 'rgba(139,92,246,0.15)',  color: '#8B5CF6' },
  admin:      { bg: 'rgba(236,72,153,0.15)',  color: '#EC4899' },
  owner:      { bg: 'rgba(34,197,94,0.15)',   color: '#22C55E' },
};

const BLANK_FORM = {
  name: '', pin: '', role: 'cashier',
  can_apply_discount: true, can_refund: false, max_discount_pct: '10',
  can_close_register: false, can_override_price: false,
  can_void: false, can_view_reports: false, can_edit_products: false, can_open_register: false,
};

const PERMISSION_ROWS = [
  { key: 'can_apply_discount', label: 'Apply discounts' },
  { key: 'can_refund',         label: 'Process refunds' },
  { key: 'can_void',           label: 'Void transactions' },
  { key: 'can_close_register', label: 'Close register' },
  { key: 'can_open_register',  label: 'Open register' },
  { key: 'can_override_price', label: 'Override prices' },
  { key: 'can_edit_products',  label: 'Edit products' },
  { key: 'can_view_reports',   label: 'View reports' },
];

export default function UsersSettingsPage() {
  const [users, setUsers]       = useState<PosUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [businessId, setBid]    = useState<string | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [editUser, setEditUser] = useState<PosUser | null>(null);
  const [form, setForm]         = useState({ ...BLANK_FORM });
  const [saving, setSaving]     = useState(false);
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => { if (d.business_id) setBid(d.business_id); });
  }, []);

  const load = useCallback(async () => {
    if (!businessId) return;
    const d = await fetch(`/api/pos/users?business_id=${businessId}`).then(r => r.json());
    setUsers(d.users ?? []);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { if (businessId) load(); }, [businessId, load]);

  function setDefaultsForRole(role: string) {
    const isElevated = ['manager', 'admin', 'owner'].includes(role);
    const isSupervisor = role === 'supervisor';
    setForm(f => ({
      ...f, role,
      can_apply_discount: true,
      can_refund: isElevated,
      can_void: isElevated,
      can_close_register: isElevated || isSupervisor,
      can_open_register: isElevated || isSupervisor,
      can_override_price: isElevated,
      can_edit_products: isElevated,
      can_view_reports: isElevated,
      max_discount_pct: isElevated ? '100' : isSupervisor ? '25' : '10',
    }));
  }

  function openEdit(u: PosUser) {
    setEditUser(u);
    setForm({
      name: u.name, pin: '', role: u.role,
      can_apply_discount: u.permissions?.can_apply_discount ?? true,
      can_refund: u.permissions?.can_refund ?? false,
      max_discount_pct: String(u.permissions?.max_discount_pct ?? 10),
      can_close_register: u.permissions?.can_close_register ?? false,
      can_override_price: u.permissions?.can_override_price ?? false,
      can_void: u.permissions?.can_void ?? false,
      can_view_reports: u.permissions?.can_view_reports ?? false,
      can_edit_products: u.permissions?.can_edit_products ?? false,
      can_open_register: u.permissions?.can_open_register ?? false,
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
      can_void: form.can_void,
      can_view_reports: form.can_view_reports,
      can_edit_products: form.can_edit_products,
      can_open_register: form.can_open_register,
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
    if (!businessId || !confirm('Remove this user from POS access?')) return;
    await fetch(`/api/pos/users/${id}?business_id=${businessId}`, { method: 'DELETE' });
    load();
  }

  const rc = (role: string) => ROLE_COLORS[role] ?? { bg: 'rgba(255,255,255,0.05)', color: C.muted };

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Staff PINs & Permissions</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Manage who can log in at the register and what they can do</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditUser(null); setForm({ ...BLANK_FORM }); }}
          style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add staff
        </button>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 28px' }}>

        {/* Add / Edit form */}
        {showAdd && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '24px', marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 20 }}>{editUser ? 'Edit staff member' : 'New staff member'}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div>
                <label style={lCls}>Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Staff name" style={iCls} />
              </div>
              <div>
                <label style={lCls}>PIN {editUser ? '(blank = keep current)' : '(4 digits)'}</label>
                <input type="password" inputMode="numeric" maxLength={4} value={form.pin}
                  onChange={e => { setForm(f => ({ ...f, pin: e.target.value })); setPinError(''); }}
                  placeholder="••••" style={{ ...iCls, fontFamily: 'monospace', letterSpacing: '0.2em' }} />
                {pinError && <p style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{pinError}</p>}
              </div>
              <div>
                <label style={lCls}>Role</label>
                <select value={form.role} onChange={e => setDefaultsForRole(e.target.value)}
                  style={{ ...iCls, cursor: 'pointer' }}>
                  {ROLES.map(r => <option key={r} value={r} style={{ background: '#111' }}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, marginBottom: 20 }}>
              <p style={lCls}>Permissions</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {PERMISSION_ROWS.map(p => (
                  <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}` }}>
                    <div
                      onClick={() => setForm(f => ({ ...f, [p.key]: !f[p.key as keyof typeof f] }))}
                      style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: 'pointer',
                        background: form[p.key as keyof typeof form] ? C.violet : 'transparent',
                        border: `2px solid ${form[p.key as keyof typeof form] ? C.violet : C.dim}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 150ms',
                      }}>
                      {form[p.key as keyof typeof form] && <span style={{ fontSize: 10, color: '#fff', fontWeight: 800 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 13, color: C.muted }}>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={lCls}>Max discount %</label>
                <input type="number" min="0" max="100" value={form.max_discount_pct}
                  onChange={e => setForm(f => ({ ...f, max_discount_pct: e.target.value }))}
                  style={{ ...iCls, width: 100 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
                <button onClick={save} disabled={saving}
                  style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : editUser ? 'Update' : 'Create user'}
                </button>
                <button onClick={() => { setShowAdd(false); setEditUser(null); }}
                  style={{ padding: '10px 18px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* User list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.dim, fontSize: 13 }}>Loading…</div>
        ) : users.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>👤</p>
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 4 }}>No staff added yet</p>
            <p style={{ fontSize: 12, color: C.dim }}>Add staff so they can log in with a PIN at the register</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map(u => {
              const rCol = rc(u.role);
              const perms = u.permissions ?? {};
              const activePerms = PERMISSION_ROWS.filter(p => perms[p.key as keyof typeof perms]);
              return (
                <div key={u.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: rCol.bg, border: `1.5px solid ${rCol.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: rCol.color }}>
                    {u.name[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{u.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: rCol.bg, color: rCol.color, textTransform: 'capitalize' }}>{u.role}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {activePerms.map(p => (
                        <span key={p.key} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'rgba(139,92,246,0.1)', color: C.violet, fontWeight: 600 }}>{p.label}</span>
                      ))}
                      {perms.max_discount_pct !== undefined && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'rgba(245,158,11,0.1)', color: C.amber, fontWeight: 600 }}>Max {perms.max_discount_pct}% disc.</span>
                      )}
                      {activePerms.length === 0 && <span style={{ fontSize: 11, color: C.dim }}>No special permissions</span>}
                    </div>
                    <p style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
                      {u.last_login_at
                        ? `Last login: ${new Date(u.last_login_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                        : 'Never logged in'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => openEdit(u)}
                      style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Edit
                    </button>
                    <button onClick={() => deactivate(u.id)}
                      style={{ padding: '7px 14px', borderRadius: 8, border: 'rgba(239,68,68,0.3) 1px solid', background: 'transparent', color: C.red, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Role legend */}
        <div style={{ marginTop: 28, padding: '16px 18px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Role access levels</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {ROLES.map((r, i) => {
              const rCol = rc(r);
              const accessCount = [0, 1, 2, 3, 4][i];
              return (
                <div key={r} style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 10, background: rCol.bg, border: `1px solid ${rCol.color}30` }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: rCol.color, textTransform: 'capitalize', marginBottom: 3 }}>{r}</p>
                  <p style={{ fontSize: 10, color: C.dim }}>Level {accessCount}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
