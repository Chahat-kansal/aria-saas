'use client'
import { useState, useRef, useEffect } from 'react'

// LOY-REDEEM-SCAN (cashier UI) — scan a customer's short-lived redeem code, confirm, and redeem
// through the EXISTING /api/pos/loyalty/redeem route. POS theme (CSS vars), no new palette.

interface Resolved {
  customer_id: string; name: string | null
  program_type: 'points' | 'stamps'
  points_balance: number; point_value_cents: number; dollar_value: number
  stamps_count: number; stamps_target: number; stamp_reward_text: string; stamp_reward_ready: boolean
}

export default function LoyaltyScanPage() {
  const [token, setToken] = useState('')
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [points, setPoints] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ discount: number; balance: number; reward: string | null } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [resolved, done])

  const reset = () => { setToken(''); setResolved(null); setPoints(''); setError(''); setDone(null); setTimeout(() => inputRef.current?.focus(), 0) }

  const resolve = async () => {
    const t = token.trim()
    if (!t) return
    setBusy(true); setError(''); setResolved(null)
    try {
      const r = await fetch('/api/loyalty/redeem-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, action: 'resolve' }) })
      const d = await r.json()
      if (!r.ok || d.error) { setError(d.error || 'Could not read that code.') }
      else { setResolved(d as Resolved); setPoints(d.program_type === 'points' ? String(d.points_balance) : '') }
    } catch { setError('Something went wrong — try again.') }
    setBusy(false)
  }

  const confirmRedeem = async () => {
    if (!resolved) return
    const isStamps = resolved.program_type === 'stamps'
    const pts = isStamps ? 0 : Math.floor(Number(points) || 0)
    if (!isStamps && (pts <= 0 || pts > resolved.points_balance)) { setError(`Enter 1–${resolved.points_balance} points.`); return }
    setBusy(true); setError('')
    try {
      // 1) Atomically consume the single-use token (burns it so a screenshot can't be replayed).
      const cr = await fetch('/api/loyalty/redeem-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.trim(), action: 'consume' }) })
      const cd = await cr.json()
      if (!cr.ok || !cd.customer_id) { setError(cd.error || 'This code has already been used or expired.'); setBusy(false); return }

      // 2) Redeem through the EXISTING ledger route (unchanged).
      const reward = isStamps ? resolved.stamp_reward_text : `${pts} points`
      const body = isStamps
        ? { customer_id: cd.customer_id, type: 'redeem', stamps_delta: -resolved.stamps_target, reward_redeemed: reward }
        : { customer_id: cd.customer_id, type: 'redeem', points_delta: -pts, reward_redeemed: reward }
      const rr = await fetch('/api/pos/loyalty/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const rd = await rr.json()
      if (!rr.ok || rd.error) { setError(rd.error || 'Redeem failed — the code was used; ask the customer for a fresh one.'); setBusy(false); return }
      setDone({ discount: rd.discount_dollars ?? 0, balance: rd.new_points_balance ?? 0, reward: isStamps ? resolved.stamp_reward_text : null })
    } catch { setError('Something went wrong — try again.') }
    setBusy(false)
  }

  const wrap = { maxWidth: 460, margin: '0 auto', padding: 24, fontFamily: 'var(--font-ui)' } as const
  const cardS = { background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 20 } as const
  const inputS = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 16, boxSizing: 'border-box' as const, fontFamily: 'var(--font-mono)' }
  const primary = { width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: '#2D5240', color: '#7FB897', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Scan loyalty code</h1>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 18 }}>Scan or type the customer&apos;s code, then confirm the redeem.</p>

      {done ? (
        <div style={{ ...cardS, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Redeemed{done.reward ? `: ${done.reward}` : ''}</p>
          {done.discount > 0 && <p style={{ fontSize: 15, color: '#7FB897', marginTop: 6 }}>${done.discount.toFixed(2)} off this sale</p>}
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 6 }}>New balance: {done.balance} points</p>
          <button onClick={reset} style={{ ...primary, marginTop: 18 }}>Scan another</button>
        </div>
      ) : !resolved ? (
        <div style={cardS}>
          <form onSubmit={e => { e.preventDefault(); resolve() }}>
            <input ref={inputRef} value={token} onChange={e => setToken(e.target.value)} placeholder="Scan or enter code" autoComplete="off" style={inputS} />
            {error && <p style={{ color: '#F87171', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
            <button type="submit" disabled={busy || !token.trim()} style={{ ...primary, marginTop: 14, opacity: busy || !token.trim() ? 0.6 : 1 }}>{busy ? 'Looking up…' : 'Look up'}</button>
          </form>
        </div>
      ) : (
        <div style={cardS}>
          <p style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 4 }}>Customer</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>{resolved.name ?? 'Member'}</p>

          {resolved.program_type === 'stamps' ? (
            <>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{resolved.stamps_count}/{resolved.stamps_target} stamps</p>
              {!resolved.stamp_reward_ready && <p style={{ fontSize: 13, color: '#F87171', marginTop: 8 }}>Not enough stamps for a reward yet.</p>}
              {resolved.stamp_reward_ready && <p style={{ fontSize: 14, color: '#7FB897', marginTop: 8 }}>Reward ready: {resolved.stamp_reward_text}</p>}
              {error && <p style={{ color: '#F87171', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
              <button onClick={confirmRedeem} disabled={busy || !resolved.stamp_reward_ready} style={{ ...primary, marginTop: 14, opacity: busy || !resolved.stamp_reward_ready ? 0.5 : 1 }}>{busy ? 'Redeeming…' : `Redeem ${resolved.stamp_reward_text}`}</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Balance: {resolved.points_balance} points (${resolved.dollar_value.toFixed(2)})</p>
              <label style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'block', margin: '14px 0 5px' }}>Points to redeem</label>
              <input type="number" min={1} max={resolved.points_balance} value={points} onChange={e => setPoints(e.target.value)} style={inputS} />
              {error && <p style={{ color: '#F87171', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
              <button onClick={confirmRedeem} disabled={busy} style={{ ...primary, marginTop: 14, opacity: busy ? 0.6 : 1 }}>{busy ? 'Redeeming…' : 'Confirm redeem'}</button>
            </>
          )}
          <button onClick={reset} style={{ width: '100%', padding: 10, marginTop: 10, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
        </div>
      )}
    </div>
  )
}
