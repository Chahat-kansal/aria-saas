'use client'
import { useState, useEffect } from 'react'

interface Staff { id: string; name: string; email: string | null; role: string; is_active: boolean; permissions: Record<string, boolean> | null }

const ROLES = ['owner', 'manager', 'cashier', 'staff'] as const
type Role = typeof ROLES[number]

const PERMISSIONS = [
  { key: 'can_void', label: 'Void sales' },
  { key: 'can_discount', label: 'Apply discounts' },
  { key: 'can_close_register', label: 'Close register' },
  { key: 'can_view_reports', label: 'View reports' },
  { key: 'can_manage_products', label: 'Manage products' },
  { key: 'can_manage_staff', label: 'Manage staff' },
  { key: 'can_refund', label: 'Process refunds' },
  { key: 'can_reopen', label: 'Reopen closed sales' },
]

const ROLE_DEFAULTS: Record<Role, Record<string, boolean>> = {
  owner:   Object.fromEntries(PERMISSIONS.map(p => [p.key, true])),
  manager: Object.fromEntries(PERMISSIONS.map(p => [p.key, !['can_manage_staff'].includes(p.key)])),
  cashier: Object.fromEntries(PERMISSIONS.map(p => [p.key, ['can_discount'].includes(p.key)])),
  staff:   Object.fromEntries(PERMISSIONS.map(p => [p.key, false])),
}

const ROLE_COLORS: Record<string, string> = { owner: '#7FB897', manager: '#8B5CF6', cashier: '#6B96B0', staff: '#94A3B8' }
const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 11px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }

export default function RolesPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [localPerms, setLocalPerms] = useState<Record<string, Record<string, boolean>>>({})

  async function load() {
    setLoading(true)
    const res = await fetch('/api/pos/staff').then(r => r.json()).catch(() => ({ staff: [] }))
    const list: Staff[] = res.staff ?? res.data ?? []
    setStaff(list)
    const perms: Record<string, Record<string, boolean>> = {}
    for (const s of list) {
      perms[s.id] = s.permissions ?? ROLE_DEFAULTS[s.role as Role] ?? ROLE_DEFAULTS.staff
    }
    setLocalPerms(perms)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function changeRole(id: string, role: Role) {
    setSaving(id)
    const defaults = ROLE_DEFAULTS[role]
    await fetch(`/api/pos/staff?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, permissions: defaults }) })
    setStaff(ss => ss.map(s => s.id === id ? { ...s, role } : s))
    setLocalPerms(p => ({ ...p, [id]: defaults }))
    setSaving(null)
  }

  async function savePerms(id: string) {
    setSaving(id)
    await fetch(`/api/pos/staff?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions: localPerms[id] }) })
    setSaving(null)
  }

  function togglePerm(staffId: string, key: string) {
    setLocalPerms(p => ({ ...p, [staffId]: { ...p[staffId], [key]: !p[staffId]?.[key] } }))
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--text-tertiary)', fontFamily: "'Manrope',sans-serif", fontSize: 13 }}>Loading…</div>

  if (staff.length === 0) return (
    <div style={{ padding: 32, fontFamily: "'Manrope',sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Roles & Permissions</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No staff members yet. <a href="/pos/settings/users" style={{ color: 'var(--violet)' }}>Add staff</a> to manage their roles and permissions.</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Roles & Permissions</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>Set each staff member's role and customise their permissions.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {staff.filter(s => s.is_active).map(s => {
          const perms = localPerms[s.id] ?? {}
          const roleColor = ROLE_COLORS[s.role] ?? '#94A3B8'
          return (
            <div key={s.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                  {s.email && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.email}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select value={s.role} onChange={e => changeRole(s.id, e.target.value as Role)}
                    style={{ ...inp, paddingRight: 28, cursor: 'pointer', color: roleColor, fontWeight: 700 }}>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                  {saving === s.id && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Saving…</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8, marginBottom: 14 }}>
                {PERMISSIONS.map(perm => (
                  <label key={perm.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer',
                    padding: '6px 10px', borderRadius: 8,
                    background: perms[perm.key] ? 'rgba(127,184,151,0.08)' : 'var(--bg-elevated)',
                    border: `1px solid ${perms[perm.key] ? 'rgba(127,184,151,0.2)' : 'var(--divider)'}` }}>
                    <input type="checkbox" checked={!!perms[perm.key]} onChange={() => togglePerm(s.id, perm.key)} />
                    <span style={{ color: perms[perm.key] ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{perm.label}</span>
                  </label>
                ))}
              </div>

              <button onClick={() => savePerms(s.id)} disabled={saving === s.id}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving === s.id ? 0.6 : 1 }}>
                Save Permissions
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}