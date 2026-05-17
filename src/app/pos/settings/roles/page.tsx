'use client'
import { useState, useEffect, useCallback } from 'react'

const CANONICAL_FLAGS = [
  'can_apply_discount', 'max_discount_pct', 'can_void', 'can_refund', 'max_refund_amount',
  'can_close_register', 'can_open_register', 'can_override_price', 'can_apply_manual_price',
  'can_reopen_sale', 'can_edit_products', 'can_view_cost_price', 'can_manage_staff',
  'can_issue_store_credit', 'can_view_other_cashier_sales', 'can_access_cash_management',
  'can_do_stocktake', 'can_receive_purchase_orders', 'can_create_purchase_orders',
  'can_manage_customers', 'can_view_customer_contact', 'can_send_sms', 'can_access_timesheets',
  'can_edit_own_timesheet', 'can_approve_timesheets', 'can_access_waste_log', 'can_access_kds',
  'can_print_labels', 'can_export_data', 'can_view_reports',
  'can_create_transfer', 'can_approve_transfer', 'can_receive_transfer',
]
const NUMERIC_FLAGS = ['max_discount_pct', 'max_refund_amount']

interface Role {
  id: string
  role_key: string
  display_name: string
  description: string | null
  permissions: Record<string, unknown>
  is_system: boolean
  is_active: boolean
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Role | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/pos/custom-roles')
    const d = await r.json()
    setRoles(d.roles ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function saveNew(form: Partial<Role>) {
    const r = await fetch('/api/pos/custom-roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (r.ok) { setShowAdd(false); load() } else { const e = await r.json(); alert(e.error ?? 'Failed') }
  }
  async function saveEdit(id: string, form: Partial<Role>) {
    const r = await fetch(`/api/pos/custom-roles/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (r.ok) { setEditing(null); load() } else { const e = await r.json(); alert(e.error ?? 'Failed') }
  }
  async function remove(id: string) {
    if (!confirm('Deactivate this role?')) return
    const r = await fetch(`/api/pos/custom-roles/${id}`, { method: 'DELETE' })
    if (r.ok) load(); else { const e = await r.json(); alert(e.error ?? 'Failed') }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Custom roles</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Define roles beyond the 5 system defaults (cashier, supervisor, manager, admin, owner). Each role is a subset of the 33 canonical permission flags.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white">+ New role</button>
      </div>
      {loading ? <div>Loading…</div> : roles.length === 0 ? (
        <div className="bg-white rounded-2xl border p-8 text-center text-sm text-[rgba(26,26,22,.5)]">No custom roles yet. The 5 system roles (cashier/supervisor/manager/admin/owner) are always available.</div>
      ) : (
        <div className="space-y-2">
          {roles.map(r => (
            <div key={r.id} className="bg-white rounded-xl border p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{r.display_name} <span className="text-xs text-[rgba(26,26,22,.4)] font-mono">{r.role_key}</span></div>
                {r.description && <div className="text-xs text-[rgba(26,26,22,.5)] mt-0.5">{r.description}</div>}
                <div className="text-xs text-[rgba(26,26,22,.4)] mt-1">
                  {Object.keys(r.permissions ?? {}).filter(k => (r.permissions as Record<string, unknown>)[k] === true || typeof (r.permissions as Record<string, unknown>)[k] === 'number').length} permissions granted
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(r)} className="text-xs text-[#8B5CF6]">Edit</button>
                <button onClick={() => remove(r.id)} className="text-xs text-red-600">Deactivate</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(showAdd || editing) && (
        <RoleModal
          key={editing?.id ?? 'new'}
          initial={editing ?? undefined}
          onSave={(f) => editing ? saveEdit(editing.id, f) : saveNew(f)}
          onClose={() => { setShowAdd(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function RoleModal({ initial, onSave, onClose }: { initial?: Partial<Role>; onSave: (f: Partial<Role>) => void; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Role>>(() => ({
    role_key: initial?.role_key ?? '',
    display_name: initial?.display_name ?? '',
    description: initial?.description ?? null,
    permissions: initial?.permissions ?? {},
  }))
  useEffect(() => {
    if (initial) {
      setForm({
        role_key: initial.role_key ?? '',
        display_name: initial.display_name ?? '',
        description: initial.description ?? null,
        permissions: initial.permissions ?? {},
      })
    }
  }, [initial?.id])
  function setFlag(flag: string, value: unknown) {
    setForm(f => ({ ...f, permissions: { ...(f.permissions ?? {}), [flag]: value } }))
  }
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{initial ? 'Edit role' : 'New role'}</h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs mb-1">Role key (snake_case)</label>
            <input disabled={!!initial} value={form.role_key ?? ''} onChange={e => setForm(f => ({ ...f, role_key: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm font-mono disabled:bg-gray-50" placeholder="shift_lead" />
          </div>
          <div>
            <label className="block text-xs mb-1">Display name</label>
            <input value={form.display_name ?? ''} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Shift Lead" />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs mb-1">Description</label>
          <textarea value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border rounded-xl px-3 py-2 text-sm" />
        </div>
        <h3 className="text-sm font-semibold mb-2">Permissions ({CANONICAL_FLAGS.length} flags)</h3>
        <div className="grid grid-cols-2 gap-1 max-h-72 overflow-y-auto bg-gray-50 p-3 rounded-xl mb-4">
          {CANONICAL_FLAGS.map(flag => {
            const isNumeric = NUMERIC_FLAGS.includes(flag)
            const val = (form.permissions as Record<string, unknown>)?.[flag]
            return (
              <label key={flag} className="flex items-center gap-2 text-xs py-1">
                {isNumeric ? (
                  <input type="number" min={0} value={typeof val === 'number' ? val : 0} onChange={e => setFlag(flag, parseFloat(e.target.value) || 0)} className="w-16 border rounded px-2 py-1 text-xs" />
                ) : (
                  <input type="checkbox" checked={val === true} onChange={e => setFlag(flag, e.target.checked)} />
                )}
                <span className="font-mono">{flag}</span>
              </label>
            )
          })}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm">Cancel</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white">Save role</button>
        </div>
      </div>
    </div>
  )
}
