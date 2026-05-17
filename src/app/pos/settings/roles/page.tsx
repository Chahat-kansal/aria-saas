'use client'
import { useState, useEffect } from 'react'

interface Staff { id: string; name: string; email: string | null; role: string; is_active: boolean; permissions: Record<string, boolean | number> | null }

interface PermEntry { key: string; label: string; type?: 'number'; min?: number; max?: number }

const ROLES = ['owner', 'manager', 'cashier', 'staff'] as const
type Role = typeof ROLES[number]

const PERMISSION_GROUPS: Array<{ label: string; flags: PermEntry[] }> = [
  { label: 'Sales', flags: [
    { key: 'can_apply_discount',   label: 'Apply discounts' },
    { key: 'max_discount_pct',     label: 'Max discount %', type: 'number', min: 0, max: 100 },
    { key: 'can_void',             label: 'Void sales' },
    { key: 'can_refund',           label: 'Process refunds' },
    { key: 'max_refund_amount',    label: 'Max refund A$', type: 'number', min: 0 },
    { key: 'can_override_price',   label: 'Override prices' },
    { key: 'can_apply_manual_price', label: 'Manual price entry' },
    { key: 'can_reopen_sale',      label: 'Reopen closed sales' },
    { key: 'can_issue_store_credit', label: 'Issue store credit' },
  ]},
  { label: 'Register', flags: [
    { key: 'can_open_register',        label: 'Open register' },
    { key: 'can_close_register',       label: 'Close register' },
    { key: 'can_access_cash_management', label: 'Cash management' },
  ]},
  { label: 'Products & Stock', flags: [
    { key: 'can_edit_products',          label: 'Edit products' },
    { key: 'can_view_cost_price',        label: 'View cost prices' },
    { key: 'can_do_stocktake',           label: 'Stocktake' },
    { key: 'can_receive_purchase_orders', label: 'Receive purchase orders' },
    { key: 'can_create_purchase_orders', label: 'Create purchase orders' },
    { key: 'can_access_waste_log',       label: 'Waste log' },
    { key: 'can_print_labels',           label: 'Print labels' },
  ]},
  { label: 'Customers', flags: [
    { key: 'can_manage_customers',    label: 'Manage customers' },
    { key: 'can_view_customer_contact', label: 'View contact details' },
    { key: 'can_send_sms',            label: 'Send SMS' },
  ]},
  { label: 'Staff', flags: [
    { key: 'can_manage_staff',       label: 'Manage staff' },
    { key: 'can_access_timesheets',  label: 'View all timesheets' },
    { key: 'can_edit_own_timesheet', label: 'Edit own timesheet' },
    { key: 'can_approve_timesheets', label: 'Approve timesheets' },
  ]},
  { label: 'Reporting', flags: [
    { key: 'can_view_reports',             label: 'View reports' },
    { key: 'can_view_other_cashier_sales', label: "View others' sales" },
    { key: 'can_export_data',              label: 'Export data' },
  ]},
  { label: 'Operations', flags: [
    { key: 'can_access_kds', label: 'Kitchen display (KDS)' },
  ]},
]

const ALL_FLAGS = PERMISSION_GROUPS.flatMap(g => g.flags)

// Matches ROLE_PERMISSION_DEFAULTS in check-permission.ts
const ROLE_DEFAULTS: Record<Role, Record<string, boolean | number>> = {
  owner: {
    can_apply_discount: true, max_discount_pct: 100, can_void: true, can_refund: true,
    max_refund_amount: 999999, can_close_register: true, can_open_register: true,
    can_override_price: true, can_apply_manual_price: true, can_reopen_sale: true,
    can_edit_products: true, can_view_cost_price: true, can_manage_staff: true,
    can_issue_store_credit: true, can_view_other_cashier_sales: true,
    can_access_cash_management: true, can_do_stocktake: true,
    can_receive_purchase_orders: true, can_create_purchase_orders: true,
    can_manage_customers: true, can_view_customer_contact: true, can_send_sms: true,
    can_access_timesheets: true, can_edit_own_timesheet: true, can_approve_timesheets: true,
    can_access_waste_log: true, can_access_kds: true, can_print_labels: true,
    can_export_data: true, can_view_reports: true,
  },
  manager: {
    can_apply_discount: true, max_discount_pct: 50, can_void: true, can_refund: true,
    max_refund_amount: 500, can_close_register: true, can_open_register: true,
    can_override_price: true, can_apply_manual_price: true, can_reopen_sale: true,
    can_edit_products: true, can_view_cost_price: true, can_manage_staff: false,
    can_issue_store_credit: true, can_view_other_cashier_sales: true,
    can_access_cash_management: true, can_do_stocktake: true,
    can_receive_purchase_orders: true, can_create_purchase_orders: false,
    can_manage_customers: true, can_view_customer_contact: true, can_send_sms: true,
    can_access_timesheets: true, can_edit_own_timesheet: true, can_approve_timesheets: true,
    can_access_waste_log: true, can_access_kds: true, can_print_labels: true,
    can_export_data: true, can_view_reports: true,
  },
  cashier: {
    can_apply_discount: true, max_discount_pct: 10, can_void: false, can_refund: false,
    max_refund_amount: 0, can_close_register: false, can_open_register: false,
    can_override_price: false, can_apply_manual_price: false, can_reopen_sale: false,
    can_edit_products: false, can_view_cost_price: false, can_manage_staff: false,
    can_issue_store_credit: false, can_view_other_cashier_sales: false,
    can_access_cash_management: false, can_do_stocktake: false,
    can_receive_purchase_orders: false, can_create_purchase_orders: false,
    can_manage_customers: false, can_view_customer_contact: false, can_send_sms: false,
    can_access_timesheets: false, can_edit_own_timesheet: true, can_approve_timesheets: false,
    can_access_waste_log: false, can_access_kds: true, can_print_labels: true,
    can_export_data: false, can_view_reports: false,
  },
  staff: {
    can_apply_discount: false, max_discount_pct: 0, can_void: false, can_refund: false,
    max_refund_amount: 0, can_close_register: false, can_open_register: false,
    can_override_price: false, can_apply_manual_price: false, can_reopen_sale: false,
    can_edit_products: false, can_view_cost_price: false, can_manage_staff: false,
    can_issue_store_credit: false, can_view_other_cashier_sales: false,
    can_access_cash_management: false, can_do_stocktake: false,
    can_receive_purchase_orders: false, can_create_purchase_orders: false,
    can_manage_customers: false, can_view_customer_contact: false, can_send_sms: false,
    can_access_timesheets: false, can_edit_own_timesheet: true, can_approve_timesheets: false,
    can_access_waste_log: false, can_access_kds: true, can_print_labels: false,
    can_export_data: false, can_view_reports: false,
  },
}

const ROLE_COLORS: Record<string, string> = { owner: '#7FB897', manager: '#8B5CF6', cashier: '#6B96B0', staff: '#94A3B8' }
const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 11px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }

export default function RolesPage() {
  const [staff, setStaff]           = useState<Staff[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<string | null>(null)
  const [localPerms, setLocalPerms] = useState<Record<string, Record<string, boolean | number>>>({})

  async function load() {
    setLoading(true)
    const res = await fetch('/api/pos/staff').then(r => r.json()).catch(() => ({ staff: [] }))
    const list: Staff[] = res.staff ?? res.data ?? []
    setStaff(list)
    const perms: Record<string, Record<string, boolean | number>> = {}
    for (const s of list) {
      perms[s.id] = (s.permissions as Record<string, boolean | number>) ?? ROLE_DEFAULTS[s.role as Role] ?? ROLE_DEFAULTS.staff
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

  function setNumericPerm(staffId: string, key: string, value: number) {
    setLocalPerms(p => ({ ...p, [staffId]: { ...p[staffId], [key]: value } }))
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
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>Set each staff member&apos;s role and customise their individual permissions.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {staff.filter(s => s.is_active).map(s => {
          const perms     = localPerms[s.id] ?? {}
          const roleColor = ROLE_COLORS[s.role] ?? '#94A3B8'
          const boolFlags = ALL_FLAGS.filter(f => f.type !== 'number')
          const enabledCount = boolFlags.filter(f => perms[f.key]).length

          return (
            <div key={s.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '18px 20px' }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                  {s.email && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.email}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{enabledCount} / {boolFlags.length} permissions enabled</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select value={s.role} onChange={e => changeRole(s.id, e.target.value as Role)}
                    style={{ ...inp, paddingRight: 28, cursor: 'pointer', color: roleColor, fontWeight: 700 }}>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                  {saving === s.id && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Saving…</span>}
                </div>
              </div>

              {/* Permission groups */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
                {PERMISSION_GROUPS.map(group => (
                  <div key={group.label}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{group.label}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 6 }}>
                      {group.flags.map(flag => flag.type === 'number' ? (
                        <div key={flag.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--divider)' }}>
                          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{flag.label}</span>
                          <input type="number" min={flag.min ?? 0} max={flag.max} value={Number(perms[flag.key]) || 0}
                            onChange={e => setNumericPerm(s.id, flag.key, Math.max(flag.min ?? 0, Math.min(flag.max ?? 999999, Number(e.target.value) || 0)))}
                            style={{ width: 64, background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 6, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', textAlign: 'right' }} />
                        </div>
                      ) : (
                        <label key={flag.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer',
                          padding: '6px 10px', borderRadius: 8,
                          background: perms[flag.key] ? 'rgba(127,184,151,0.08)' : 'var(--bg-elevated)',
                          border: `1px solid ${perms[flag.key] ? 'rgba(127,184,151,0.2)' : 'var(--divider)'}` }}>
                          <input type="checkbox" checked={!!perms[flag.key]} onChange={() => togglePerm(s.id, flag.key)} />
                          <span style={{ color: perms[flag.key] ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{flag.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
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