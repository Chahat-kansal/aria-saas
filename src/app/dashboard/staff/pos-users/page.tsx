'use client'
import { useCallback, useEffect, useState } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { POS_PERMISSIONS, PERMISSION_LABELS, ROLE_DEFAULTS, type PosPermissionKey } from '@/lib/pos-permissions'

type PosUser = {
  id: string
  business_id: string
  name: string
  role: string
  permissions: Partial<Record<PosPermissionKey, boolean>>
  manager_pin: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

const ROLE_COLOR: Record<string, string> = {
  owner: 'bg-purple-500/20 text-purple-300',
  manager: 'bg-blue-500/20 text-blue-300',
  supervisor: 'bg-indigo-500/20 text-indigo-300',
  cashier: 'bg-emerald-500/20 text-emerald-300',
}

export default function PosUsersPage() {
  const { business } = useBusinessContext()
  const [users, setUsers] = useState<PosUser[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { permissions: Record<string, boolean>; manager_pin: string }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const r = await fetch(`/api/pos/users?business_id=${business.id}`)
    const j = await r.json()
    setUsers(j.users ?? [])
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  function getDraft(u: PosUser) {
    return drafts[u.id] ?? {
      permissions: { ...u.permissions },
      manager_pin: u.manager_pin ?? '',
    }
  }

  function setPermFlag(userId: string, key: PosPermissionKey, value: boolean) {
    setDrafts(prev => ({
      ...prev,
      [userId]: {
        ...getDraftById(userId, prev),
        permissions: { ...getDraftById(userId, prev).permissions, [key]: value },
      },
    }))
  }

  function getDraftById(userId: string, prev: typeof drafts) {
    const u = users.find(x => x.id === userId)
    return prev[userId] ?? { permissions: { ...(u?.permissions ?? {}) }, manager_pin: u?.manager_pin ?? '' }
  }

  function applyRoleDefaults(u: PosUser) {
    const defaults = ROLE_DEFAULTS[u.role] ?? ROLE_DEFAULTS.cashier
    setDrafts(prev => ({
      ...prev,
      [u.id]: { ...getDraftById(u.id, prev), permissions: { ...defaults } as Record<string, boolean> },
    }))
  }

  async function save(u: PosUser) {
    if (!business?.id) return
    const draft = getDraft(u)
    setSaving(u.id)
    setSaveMsg(prev => ({ ...prev, [u.id]: '' }))
    const r = await fetch(`/api/pos/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: business.id,
        permissions: draft.permissions,
        manager_pin: draft.manager_pin || null,
      }),
    })
    const j = await r.json()
    setSaving(null)
    if (r.ok) {
      setSaveMsg(prev => ({ ...prev, [u.id]: 'Saved' }))
      await load()
      setTimeout(() => setSaveMsg(prev => ({ ...prev, [u.id]: '' })), 2000)
    } else {
      setSaveMsg(prev => ({ ...prev, [u.id]: j.error ?? 'Failed' }))
    }
  }

  const permKeys = Object.keys(POS_PERMISSIONS) as PosPermissionKey[]

  return (
    <div className="p-6 max-w-5xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header>
        <h1 className="text-2xl font-medium">POS Users &amp; Permissions</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Manage granular permissions and manager PIN overrides for each POS staff member.
        </p>
      </header>

      {loading ? (
        <p className="text-sm py-8" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm py-8" style={{ color: 'var(--text-secondary)' }}>No POS users found for this business.</p>
      ) : (
        <div className="space-y-3">
          {users.map(u => {
            const draft = getDraft(u)
            const isExpanded = expanded === u.id
            const isManagerOrOwner = ['owner', 'manager'].includes(u.role)
            return (
              <div key={u.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--divider, rgba(232,237,231,0.08))' }}>
                {/* Header row */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : u.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                  style={{ background: 'var(--bg-elevated, #1A2620)' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium"
                      style={{ background: '#2D5240' }}>
                      {u.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{u.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Last login: {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-AU') : 'Never'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded capitalize ${ROLE_COLOR[u.role] ?? 'bg-white/10 text-white/60'}`}>
                      {u.role}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded permissions panel */}
                {isExpanded && (
                  <div className="p-5 space-y-5" style={{ background: 'var(--bg-surface, #0E1812)' }}>
                    {/* Role defaults + save controls */}
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <button
                        onClick={() => applyRoleDefaults(u)}
                        className="text-xs px-3 py-1.5 rounded-lg"
                        style={{ background: 'rgba(45,82,64,0.3)', border: '1px solid rgba(127,184,151,0.3)', color: '#7FB897' }}
                      >
                        Apply {u.role} defaults
                      </button>
                      <div className="flex items-center gap-3">
                        {saveMsg[u.id] && (
                          <span className="text-xs" style={{ color: saveMsg[u.id] === 'Saved' ? '#7FB897' : '#ef4444' }}>
                            {saveMsg[u.id]}
                          </span>
                        )}
                        <button
                          onClick={() => save(u)}
                          disabled={saving === u.id}
                          className="text-xs px-4 py-1.5 rounded-lg font-medium disabled:opacity-50"
                          style={{ background: '#2D5240', color: '#7FB897' }}
                        >
                          {saving === u.id ? 'Saving…' : 'Save permissions'}
                        </button>
                      </div>
                    </div>

                    {/* Manager PIN — only for manager/owner roles */}
                    {isManagerOrOwner && (
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-medium w-36" style={{ color: 'var(--text-secondary)' }}>Manager PIN</label>
                        <input
                          type="text"
                          maxLength={6}
                          value={draft.manager_pin}
                          onChange={e => setDrafts(prev => ({
                            ...prev,
                            [u.id]: { ...getDraftById(u.id, prev), manager_pin: e.target.value.replace(/\D/g, '') },
                          }))}
                          placeholder="4–6 digits"
                          className="w-32 px-3 py-1.5 rounded-lg text-sm"
                          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid rgba(127,184,151,0.3)', color: 'var(--text-primary)' }}
                        />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Used to approve override actions at the POS terminal</span>
                      </div>
                    )}

                    {/* Permission toggles grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {permKeys.map(key => {
                        const enabled = draft.permissions[key] ?? false
                        return (
                          <label key={key} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer"
                            style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
                            <span className="text-xs" style={{ color: enabled ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                              {PERMISSION_LABELS[key]}
                            </span>
                            <button
                              onClick={() => setPermFlag(u.id, key, !enabled)}
                              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-[#2D5240]' : 'bg-white/10'}`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform bg-white ${enabled ? 'left-4' : 'left-0.5'}`} />
                            </button>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
