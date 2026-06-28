'use client'
import { useCallback, useEffect, useState } from 'react'

const ROLES = ['staff', 'cashier', 'manager', 'owner'] as const
type Role = (typeof ROLES)[number]

const ROLE_BADGE: Record<string, { bg: string; col: string }> = {
  owner:   { bg: 'rgba(139,92,246,0.18)', col: '#a78bfa' },
  manager: { bg: 'rgba(45,82,64,0.45)',   col: '#7FB897'  },
  cashier: { bg: 'rgba(16,185,129,0.15)', col: '#34d399'  },
  staff:   { bg: 'rgba(255,255,255,0.08)',col: 'rgba(255,255,255,0.45)' },
}

const AVATAR_COLORS = ['#2D5240','#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899']

interface InvStaff {
  id: string
  name: string
  email: string | null
  role: string
  is_active: boolean
  color: string | null
  pin: string | null
  created_at: string | null
}

const G   = '#7FB897'
const GD  = '#2D5240'
const DIV = 'rgba(232,237,231,0.08)'
const BGS = '#0E1812'
const BGE = '#1A2620'
const TP  = '#E8EDE7'
const TS  = 'rgba(232,237,231,0.5)'

function ini(name: string) {
  return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2)
}

function hasPin(s: InvStaff) {
  return s.pin != null && String(s.pin).trim().length > 0
}

function roleLabel(r: string) {
  if (r === 'manager') return 'Manager (can adjust stock)'
  if (r === 'owner')   return 'Owner (full access)'
  if (r === 'cashier') return 'Cashier'
  return 'Staff'
}

export default function InventoryTeamPage() {
  const [staff, setStaff]   = useState<InvStaff[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast]   = useState('')

  // Add form
  const [showAdd, setShowAdd]   = useState(false)
  const [addName, setAddName]   = useState('')
  const [addRole, setAddRole]   = useState<Role>('staff')
  const [addEmail, setAddEmail] = useState('')
  const [addColor, setAddColor] = useState(AVATAR_COLORS[0])
  const [addPin, setAddPin]     = useState('')
  const [adding, setAdding]     = useState(false)

  // Per-staff PIN panel
  const [pinOpen, setPinOpen] = useState<string | null>(null)
  const [pinVal, setPinVal]   = useState('')
  const [pinBusy, setPinBusy] = useState(false)

  // Per-staff role panel
  const [roleOpen, setRoleOpen] = useState<string | null>(null)
  const [roleVal, setRoleVal]   = useState<Role>('staff')
  const [roleBusy, setRoleBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/pos/staff')
      const j = await r.json()
      setStaff(j.staff ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2800)
  }

  async function addMember() {
    if (!addName.trim()) return
    setAdding(true)
    const body: Record<string, unknown> = { name: addName.trim(), role: addRole, color: addColor }
    if (addEmail.trim()) body.email = addEmail.trim()
    if (addPin.length === 4) body.pin = addPin
    const r = await fetch('/api/pos/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setAdding(false)
    if (r.ok) {
      setAddName(''); setAddRole('staff'); setAddEmail('')
      setAddColor(AVATAR_COLORS[0]); setAddPin(''); setShowAdd(false)
      showToast(addPin ? addName.trim() + ' added — can log in immediately' : addName.trim() + ' added — set a PIN so they can log in')
      await load()
    } else {
      const j = await r.json()
      showToast('Error: ' + (j.error ?? 'Failed'))
    }
  }

  async function savePin(id: string) {
    if (pinVal.length !== 4 || !/^\d{4}$/.test(pinVal)) {
      showToast('PIN must be exactly 4 digits')
      return
    }
    setPinBusy(true)
    const r = await fetch('/api/pos/staff?id=' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinVal }),
    })
    setPinBusy(false)
    if (r.ok) {
      setPinOpen(null); setPinVal('')
      showToast('PIN saved — staff can now log in')
      await load()
    } else {
      showToast('Failed to save PIN')
    }
  }

  async function removePin(id: string) {
    const r = await fetch('/api/pos/staff?id=' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: null }),
    })
    if (r.ok) {
      setPinOpen(null); setPinVal('')
      showToast('PIN removed — staff will see "No PIN — ask manager" at login')
      await load()
    }
  }

  async function saveRole(id: string) {
    setRoleBusy(true)
    const r = await fetch('/api/pos/staff?id=' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: roleVal }),
    })
    setRoleBusy(false)
    if (r.ok) {
      setRoleOpen(null)
      showToast('Role updated')
      await load()
    } else {
      showToast('Failed to update role')
    }
  }

  async function toggleActive(s: InvStaff) {
    const next = !s.is_active
    const r = await fetch('/api/pos/staff?id=' + s.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: next }),
    })
    if (r.ok) {
      showToast(next ? s.name + ' reactivated' : s.name + ' deactivated — history preserved')
      await load()
    }
  }

  const active   = staff.filter(s => s.is_active)
  const inactive = staff.filter(s => !s.is_active)

  return (
    <div style={{ padding: 24, maxWidth: 760, color: TP }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Inventory Team</h1>
          <p style={{ fontSize: 13, color: TS, marginTop: 6, maxWidth: 480, lineHeight: 1.55, margin: '6px 0 0' }}>
            Manage who can log into the inventory tool. Staff without a PIN appear disabled at the
            login screen — set one here to unlock them. Role controls what each person can do.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          style={{
            padding: '9px 18px', borderRadius: 9,
            background: showAdd ? 'rgba(127,184,151,0.12)' : GD,
            color: G, fontSize: 13, fontWeight: 700,
            border: '1px solid ' + (showAdd ? G : 'transparent'),
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          {showAdd ? 'Cancel' : '+ Add staff'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          background: 'rgba(45,82,64,0.25)', border: '1px solid rgba(127,184,151,0.35)',
          borderRadius: 10, padding: '10px 16px', fontSize: 13, color: G, marginBottom: 16,
        }}>
          {toast}
        </div>
      )}

      {/* Add staff form */}
      {showAdd && (
        <div style={{ border: '1px solid rgba(127,184,151,0.28)', borderRadius: 12, padding: 20, marginBottom: 20, background: BGS }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: G, marginBottom: 14 }}>New inventory staff member</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: TS, display: 'block', marginBottom: 5 }}>Name *</label>
              <input
                value={addName}
                onChange={e => setAddName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addMember() }}
                placeholder="e.g. Maya Chen"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: BGE, border: '1px solid ' + DIV, color: TP, fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: TS, display: 'block', marginBottom: 5 }}>Role</label>
              <select
                value={addRole}
                onChange={e => setAddRole(e.target.value as Role)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: BGE, border: '1px solid ' + DIV, color: TP, fontSize: 13, boxSizing: 'border-box' }}
              >
                {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: TS, display: 'block', marginBottom: 5 }}>PIN — 4 digits</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={addPin}
                onChange={e => setAddPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: BGE, border: '1px solid ' + DIV, color: TP, fontSize: 18, letterSpacing: 4, fontFamily: 'monospace', boxSizing: 'border-box' }}
              />
              <span style={{ fontSize: 10, color: TS }}>Optional — can set later</span>
            </div>
            <div>
              <label style={{ fontSize: 11, color: TS, display: 'block', marginBottom: 5 }}>Email (optional)</label>
              <input
                type="email"
                value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                placeholder="team@cafe.com"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: BGE, border: '1px solid ' + DIV, color: TP, fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Avatar colour */}
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 11, color: TS, display: 'block', marginBottom: 7 }}>Avatar colour</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {AVATAR_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setAddColor(c)}
                  title={c}
                  style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: '2.5px solid ' + (addColor === c ? G : 'transparent'), cursor: 'pointer', padding: 0 }}
                />
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              onClick={addMember}
              disabled={adding || !addName.trim()}
              style={{
                padding: '9px 22px', borderRadius: 8,
                background: addName.trim() ? GD : 'rgba(45,82,64,0.3)',
                color: G, fontSize: 13, fontWeight: 700, border: 'none',
                cursor: addName.trim() && !adding ? 'pointer' : 'not-allowed',
                opacity: addName.trim() ? 1 : 0.5,
              }}
            >
              {adding ? 'Adding…' : 'Add to team'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: TS, fontSize: 13, padding: '20px 0' }}>Loading…</p>
      ) : staff.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 24px', background: BGE, borderRadius: 12, border: '1px solid ' + DIV }}>
          <div style={{ fontSize: 13, color: TS }}>No inventory staff yet — add your first team member above.</div>
        </div>
      ) : (
        <div>
          {/* Active staff */}
          {active.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: TS, textTransform: 'uppercase', marginBottom: 10 }}>
                {'Active · ' + active.length}
              </div>
              {active.map(s => {
                const pin = hasPin(s)
                const rb  = ROLE_BADGE[s.role] ?? ROLE_BADGE.staff
                const isPinOpen  = pinOpen  === s.id
                const isRoleOpen = roleOpen === s.id
                return (
                  <div key={s.id} style={{ border: '1px solid ' + DIV, borderRadius: 12, overflow: 'hidden', marginBottom: 8, background: BGE }}>
                    {/* Main row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', flexWrap: 'wrap' }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: s.color ?? GD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {ini(s.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: TP }}>{s.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: rb.bg, color: rb.col, fontWeight: 600, textTransform: 'capitalize' }}>
                            {s.role}
                          </span>
                          {pin
                            ? <span style={{ fontSize: 11, color: G, fontWeight: 600 }}>PIN set</span>
                            : <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>No PIN — can't log in</span>
                          }
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => { setPinOpen(isPinOpen ? null : s.id); setPinVal(''); setRoleOpen(null) }}
                          style={{ fontSize: 11, padding: '5px 11px', borderRadius: 7, border: '1px solid ' + (isPinOpen ? G : 'rgba(127,184,151,0.3)'), background: isPinOpen ? 'rgba(127,184,151,0.12)' : 'transparent', color: G, cursor: 'pointer', fontWeight: 600 }}
                        >
                          {pin ? 'Change PIN' : 'Set PIN'}
                        </button>
                        <button
                          onClick={() => { setRoleOpen(isRoleOpen ? null : s.id); setRoleVal(s.role as Role); setPinOpen(null) }}
                          style={{ fontSize: 11, padding: '5px 11px', borderRadius: 7, border: '1px solid ' + (isRoleOpen ? G : DIV), background: isRoleOpen ? 'rgba(127,184,151,0.12)' : 'transparent', color: isRoleOpen ? G : TS, cursor: 'pointer', fontWeight: 600 }}
                        >
                          Role
                        </button>
                        <button
                          onClick={() => toggleActive(s)}
                          style={{ fontSize: 11, padding: '5px 11px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}
                        >
                          Deactivate
                        </button>
                      </div>
                    </div>

                    {/* PIN panel */}
                    {isPinOpen && (
                      <div style={{ borderTop: '1px solid ' + DIV, padding: '14px 16px', background: BGS, display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 11, color: TS, marginBottom: 6 }}>
                            {pin ? 'New 4-digit PIN' : 'Set a 4-digit PIN to unlock login'}
                          </div>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={4}
                            value={pinVal}
                            onChange={e => setPinVal(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="••••"
                            autoFocus
                            style={{ width: 96, padding: '9px 12px', borderRadius: 8, background: BGE, border: '1px solid rgba(127,184,151,0.35)', color: TP, fontSize: 22, letterSpacing: 6, fontFamily: 'monospace' }}
                          />
                        </div>
                        <button
                          onClick={() => savePin(s.id)}
                          disabled={pinBusy || pinVal.length !== 4}
                          style={{ padding: '9px 18px', borderRadius: 8, background: pinVal.length === 4 ? GD : 'rgba(45,82,64,0.25)', color: G, fontSize: 13, fontWeight: 700, border: 'none', cursor: pinVal.length === 4 ? 'pointer' : 'not-allowed', opacity: pinVal.length === 4 ? 1 : 0.5 }}
                        >
                          {pinBusy ? 'Saving…' : 'Save PIN'}
                        </button>
                        {pin && (
                          <button
                            onClick={() => removePin(s.id)}
                            style={{ padding: '9px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 13, fontWeight: 600, border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer' }}
                          >
                            Remove PIN
                          </button>
                        )}
                        <button
                          onClick={() => { setPinOpen(null); setPinVal('') }}
                          style={{ padding: '9px 14px', borderRadius: 8, background: 'transparent', color: TS, fontSize: 13, border: '1px solid ' + DIV, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Role panel */}
                    {isRoleOpen && (
                      <div style={{ borderTop: '1px solid ' + DIV, padding: '14px 16px', background: BGS, display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 11, color: TS, marginBottom: 6 }}>
                            Role controls stock-adjustment permissions
                          </div>
                          <select
                            value={roleVal}
                            onChange={e => setRoleVal(e.target.value as Role)}
                            style={{ padding: '9px 12px', borderRadius: 8, background: BGE, border: '1px solid rgba(127,184,151,0.35)', color: TP, fontSize: 13 }}
                          >
                            {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                          </select>
                        </div>
                        <button
                          onClick={() => saveRole(s.id)}
                          disabled={roleBusy}
                          style={{ padding: '9px 18px', borderRadius: 8, background: GD, color: G, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: roleBusy ? 0.6 : 1 }}
                        >
                          {roleBusy ? 'Saving…' : 'Save role'}
                        </button>
                        <button
                          onClick={() => setRoleOpen(null)}
                          style={{ padding: '9px 14px', borderRadius: 8, background: 'transparent', color: TS, fontSize: 13, border: '1px solid ' + DIV, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Inactive staff */}
          {inactive.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: TS, textTransform: 'uppercase', marginBottom: 10 }}>
                {'Inactive · ' + inactive.length}
              </div>
              {inactive.map(s => {
                const pin = hasPin(s)
                const rb  = ROLE_BADGE[s.role] ?? ROLE_BADGE.staff
                return (
                  <div key={s.id} style={{ border: '1px solid ' + DIV, borderRadius: 12, marginBottom: 8, background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', opacity: 0.6, flexWrap: 'wrap' }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: s.color ?? GD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {ini(s.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: TP }}>{s.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: rb.bg, color: rb.col, fontWeight: 600, textTransform: 'capitalize' }}>
                            {s.role}
                          </span>
                          {pin
                            ? <span style={{ fontSize: 11, color: G, fontWeight: 600 }}>PIN set</span>
                            : <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>No PIN</span>
                          }
                          <span style={{ fontSize: 11, color: TS }}>Inactive</span>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleActive(s)}
                        style={{ fontSize: 11, padding: '5px 11px', borderRadius: 7, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: G, cursor: 'pointer', fontWeight: 600, flexShrink: 0, opacity: 1 }}
                      >
                        Reactivate
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Role guide footer */}
      <div style={{ marginTop: 28, padding: '14px 16px', borderRadius: 10, background: BGE, border: '1px solid ' + DIV, fontSize: 12, color: TS, lineHeight: 1.6 }}>
        <b style={{ color: TP }}>Role guide: </b>
        Staff and Cashier can log waste and run counts.{' '}
        Manager and Owner can also adjust stock levels.{' '}
        Deactivated staff cannot log in but their waste, count, and adjustment history is fully preserved.
      </div>
    </div>
  )
}
