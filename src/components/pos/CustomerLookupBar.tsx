'use client'
import { useState, useRef, useCallback, useEffect } from 'react'

export interface LoyaltyCustomer {
  id: string
  name: string
  phone: string | null
  email: string | null
  points_balance: number
  stamps_count: number
  total_spent: number
  visit_count: number
  last_visit_at: string | null
  tags: string[]
  loyalty_tier?: string | null
  preload_balance?: number
  stamp_reward_ready?: boolean
}

interface LoyaltyConfig {
  program_type: string
  points_per_dollar: number
  stamps_to_reward: number
  stamp_reward_text: string
  point_value_cents: number
}

interface Props {
  onSelect: (customer: LoyaltyCustomer | null) => void
  selected: LoyaltyCustomer | null
  loyaltyConfig?: LoyaltyConfig | null
  cartTotal?: number
}

// Detect keyboard-wedge scanner: 10 digits arrive in < 150 ms → auto-submit
const WEDGE_THRESHOLD_MS = 150

export default function CustomerLookupBar({ onSelect, selected, loyaltyConfig, cartTotal = 0 }: Props) {
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState<LoyaltyCustomer[]>([])
  const [open,        setOpen]        = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError,   setScanError]   = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newForm,     setNewForm]     = useState({ name: '', phone: '', email: '' })
  const [saving,      setSaving]      = useState(false)
  const inputRef  = useRef<HTMLInputElement>(null)
  const debounce  = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keyboard-wedge detection: track the timestamp of the first digit keypress
  const wedgeStart = useRef<number | null>(null)
  const wedgeBuffer = useRef('')

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    const res = await fetch('/api/pos/customers/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    }).then(r => r.json()).catch(() => ({ customers: [] }))
    setResults(res.customers ?? [])
    setLoading(false)
  }, [])

  // Resolve a short_code (10-digit numeric) OR UUID via the unified scan-lookup resolver
  const resolveCode = useCallback(async (code: string) => {
    setScanLoading(true)
    setScanError(null)
    try {
      const res = await fetch('/api/pos/loyalty/scan-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }).then(r => r.json())

      if (!res.found) {
        setScanError(res.reason === 'identity_not_found' ? 'Card not recognised' : 'Not a member at this business')
        setScanLoading(false)
        return
      }

      onSelect({
        id: res.customer_id,
        name: res.name ?? 'Member',
        phone: null,
        email: null,
        points_balance: res.points_balance ?? 0,
        stamps_count: res.stamps_count ?? 0,
        total_spent: res.total_spent ?? 0,
        visit_count: res.visit_count ?? 0,
        last_visit_at: null,
        tags: [],
        loyalty_tier: res.loyalty_tier ?? null,
        preload_balance: res.preload_balance ?? 0,
        stamp_reward_ready: res.stamp_reward_ready ?? false,
      })
      setQuery('')
      setScanError(null)
    } catch {
      setScanError('Lookup failed — try again')
    }
    setScanLoading(false)
  }, [onSelect])

  function handleChange(val: string) {
    setQuery(val)
    setScanError(null)
    setOpen(true)

    // Keyboard-wedge: 10 all-digit chars → auto-resolve without search dropdown
    const isAllDigit = /^\d+$/.test(val)
    if (isAllDigit) {
      if (wedgeStart.current === null) wedgeStart.current = Date.now()
      wedgeBuffer.current = val
      if (val.length === 10) {
        const elapsed = Date.now() - (wedgeStart.current ?? Date.now())
        wedgeStart.current = null
        wedgeBuffer.current = ''
        if (elapsed < WEDGE_THRESHOLD_MS) {
          // Hardware scanner — resolve immediately, skip text search
          setQuery('')
          resolveCode(val)
          return
        }
      }
    } else {
      wedgeStart.current = null
      wedgeBuffer.current = ''
    }

    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(val), 250)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const v = query.trim()
      if (/^\d{10}$/.test(v)) {
        // Manual 10-digit entry confirmed with Enter → resolve as short_code
        setQuery('')
        resolveCode(v)
        e.preventDefault()
      }
    }
  }

  function pick(c: LoyaltyCustomer) {
    onSelect(c)
    setQuery('')
    setResults([])
    setOpen(false)
    setScanError(null)
  }

  function clear() {
    onSelect(null)
    setQuery('')
    setResults([])
    setOpen(false)
    setScanError(null)
  }

  async function saveNew() {
    if (!newForm.name.trim()) return
    setSaving(true)
    const res = await fetch('/api/pos/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newForm.name, phone: newForm.phone || null, email: newForm.email || null }),
    }).then(r => r.json()).catch(() => ({}))
    setSaving(false)
    if (res.customer) {
      pick(res.customer as LoyaltyCustomer)
      setShowNewForm(false)
      setNewForm({ name: '', phone: '', email: '' })
    }
  }

  const cfg = loyaltyConfig
  const programType = cfg?.program_type ?? 'points'
  const showPoints  = ['points', 'both'].includes(programType)
  const showStamps  = ['stamps', 'both'].includes(programType)

  const earnPreview = cfg && cartTotal > 0 && programType !== 'off'
    ? Math.floor(cartTotal * (cfg.points_per_dollar ?? 1))
    : 0

  const stampsToNext = selected && cfg && showStamps
    ? Math.max(0, (cfg.stamps_to_reward ?? 10) - (selected.stamps_count ?? 0))
    : null

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const iS: React.CSSProperties = {
    background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8,
    padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none',
    fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--divider)', background: 'var(--bg-surface)' }}>
      {selected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: 'rgba(139,92,246,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0,
          }}>
            {selected.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.name}
              {selected.loyalty_tier && (
                <span style={{ fontWeight: 400, color: '#C9A37A', marginLeft: 6, fontSize: 10 }}>{selected.loyalty_tier}</span>
              )}
              {selected.phone && <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>{selected.phone}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
              {cfg && programType !== 'off' && (
                <>
                  {showPoints && (
                    <span style={{ fontSize: 10, color: '#8B5CF6', fontWeight: 700 }}>
                      {selected.points_balance ?? 0} pts
                    </span>
                  )}
                  {showStamps && (
                    <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700 }}>
                      {selected.stamps_count ?? 0}/{cfg.stamps_to_reward} ☕
                      {stampsToNext === 0
                        ? ' — FREE ' + (cfg.stamp_reward_text ?? 'item') + '!'
                        : stampsToNext === 1 ? ' — 1 more!' : ''}
                    </span>
                  )}
                  {selected.stamp_reward_ready && (
                    <span style={{ fontSize: 10, color: '#00B140', fontWeight: 700 }}>
                      🎁 Redeem {cfg?.stamp_reward_text ?? 'free item'}
                    </span>
                  )}
                  {(selected.preload_balance ?? 0) > 0 && (
                    <span style={{ fontSize: 10, color: '#0EA5E9', fontWeight: 700 }}>
                      {'$' + (selected.preload_balance ?? 0).toFixed(2) + ' store credit'}
                    </span>
                  )}
                  {earnPreview > 0 && (
                    <span style={{ fontSize: 10, color: '#7FB897' }}>+{earnPreview} pts this sale</span>
                  )}
                </>
              )}
            </div>
          </div>
          <button onClick={clear} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
        </div>
      ) : showNewForm ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={iS} placeholder="Name *" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            <input style={{ ...iS, width: '50%' }} placeholder="Phone" value={newForm.phone} onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={iS} placeholder="Email (optional)" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} />
            <button onClick={saveNew} disabled={saving || !newForm.name.trim()} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: saving ? 0.6 : 1 }}>
              {saving ? '…' : 'Save'}
            </button>
            <button onClick={() => setShowNewForm(false)} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                ref={inputRef}
                value={query}
                onChange={e => handleChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => query.length >= 2 && setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder={scanLoading ? 'Looking up…' : '🔍 Name, phone or scan loyalty code…'}
                disabled={scanLoading}
                style={{ ...iS, opacity: scanLoading ? 0.6 : 1 }}
              />
              {(loading || scanLoading) && (
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-tertiary)' }}>…</span>
              )}
            </div>
            <button onClick={() => setShowNewForm(true)} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--divider)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}>
              + New
            </button>
          </div>

          {scanError && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#EF4444', fontWeight: 600 }}>
              {scanError}
            </div>
          )}

          {open && results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 4,
              background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)', overflow: 'hidden',
            }}>
              {results.map(c => (
                <button key={c.id} onClick={() => pick(c)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  background: 'none', border: 'none', borderBottom: '1px solid var(--divider)',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{c.phone ?? c.email ?? ''}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {(c.points_balance ?? 0) > 0 && (
                      <div style={{ fontSize: 10, color: '#8B5CF6', fontWeight: 700 }}>{c.points_balance} pts</div>
                    )}
                    {c.visit_count > 0 && (
                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{c.visit_count} visits</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}