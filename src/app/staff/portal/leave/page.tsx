'use client'
import { useEffect, useState, useCallback } from 'react'

interface LeaveRequest {
  id: string; leave_type: string; start_date: string
  end_date: string; days_taken: number; status: string; notes: string | null
}
interface Balance { leave_type: string; remaining_days: number; accrued_days: number; taken_days: number }

// ── These two constants are UI-only and safe to update ──────────────────────
const LEAVE_TYPES = [
  { value: 'annual',   label: 'Annual leave' },
  { value: 'sick',     label: 'Sick leave' },
  { value: 'personal', label: 'Personal leave' },
  { value: 'other',    label: 'Other' },
]

const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual leave', sick: 'Sick leave',
  personal: 'Personal leave', other: 'Other',
}

// ─── Design tokens — same palette as home + schedule ────────────────────
const CARD      = '#ffffff'
const INK       = '#1d2a24'
const MUTED     = '#6b7d74'
const LINE      = '#e6ece8'
const SAGE      = '#7FB897'
const DEEP      = '#2D5240'
const SAGE_TINT = '#eef6f1'
const AMBER     = '#BA7517'
const RED       = '#E24B4A'
const SHADOW    = '0 1px 2px rgba(45,82,64,.06), 0 8px 24px rgba(45,82,64,.06)'

// Light-mode form input style (replaces dark INP from old build)
const INP = { background: CARD, border: '1px solid ' + LINE, color: INK }

// Status chip + left-border colours
function statusStyle(s: string) {
  if (s === 'approved') return { chipBg: 'rgba(127,184,151,.18)', chipColor: DEEP,  left: SAGE  }
  if (s === 'declined') return { chipBg: 'rgba(226,75,74,.12)',   chipColor: RED,   left: RED   }
  return                        { chipBg: 'rgba(186,117,23,.12)', chipColor: AMBER, left: AMBER }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────
function Bone({ h = 16, r = 8, w = '100%' }: { h?: number; r?: number; w?: string | number }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: 'rgba(45,82,64,.08)' }} />
}

function SkeletonCard() {
  return (
    <div style={{
      background: CARD, borderRadius: 16, boxShadow: SHADOW,
      border: '1px solid ' + LINE, borderLeft: '3px solid rgba(127,184,151,.25)',
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <Bone h={15} r={5} w="40%" />
        <Bone h={22} r={99} w={68} />
      </div>
      <Bone h={12} r={4} w="55%" />
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function StaffLeavePage() {
  const [leave,      setLeave]      = useState<LeaveRequest[]>([])
  const [balances,   setBalances]   = useState<Balance[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')
  const [form,       setForm]       = useState({ leave_type: 'annual', start_date: '', end_date: '', notes: '' })

  // ── load() — PRESERVED EXACTLY ───────────────────────────────────────────
  const load = useCallback(() => {
    fetch('/api/staff/portal/leave').then(r => r.json()).then((j: { leave?: LeaveRequest[]; balances?: Balance[] }) => {
      setLeave(j.leave ?? [])
      setBalances(j.balances ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // ── submit() — PRESERVED EXACTLY ─────────────────────────────────────────
  const submit = async () => {
    if (!form.start_date || !form.end_date) { setError('Please select dates'); return }
    setSubmitting(true); setError('')
    const r = await fetch('/api/staff/portal/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const j = await r.json() as { error?: string }
    if (r.ok) {
      setShowForm(false)
      setForm({ leave_type: 'annual', start_date: '', end_date: '', notes: '' })
      load()
    } else {
      setError(j.error ?? 'Failed to submit')
    }
    setSubmitting(false)
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) return (
    <div>
      <div style={{ paddingBottom: 16, marginBottom: 22, borderBottom: '1px solid ' + LINE }}>
        <div className="animate-pulse"><Bone h={26} r={6} w="35%" /></div>
      </div>
      <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )

  return (
    <div>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 16, marginBottom: 22, borderBottom: '1px solid ' + LINE,
        gap: 12,
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: 26, fontWeight: 600, color: INK,
            margin: 0, lineHeight: 1.15,
          }}>
            Leave
          </h1>
          <p style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            Request time off and view your history
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '8px 14px', borderRadius: 10,
            fontSize: 13, fontWeight: 600,
            background: showForm ? CARD : DEEP,
            color: showForm ? MUTED : '#ffffff',
            border: '1px solid ' + (showForm ? LINE : DEEP),
            cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}
        >
          {showForm ? 'Cancel' : '+ Request leave'}
        </button>
      </div>

      {/* ── Leave balances ────────────────────────────────────────────────── */}
      {balances.length > 0 ? (
        <div style={{
          background: CARD, borderRadius: 18, boxShadow: SHADOW,
          padding: '15px 16px', border: '1px solid ' + LINE, marginBottom: 22,
        }}>
          <div style={{
            fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
            color: MUTED, fontWeight: 600, marginBottom: 14,
          }}>
            Your balances
          </div>
          {balances.map((b, idx) => {
            const total  = Math.max(b.accrued_days, 1)
            const pct    = Math.min(100, Math.round((b.remaining_days / total) * 100))
            const isLow  = pct < 25
            const barBg  = isLow
              ? 'linear-gradient(90deg, #e9b765, ' + AMBER + ')'
              : 'linear-gradient(90deg, ' + SAGE + ', ' + DEEP + ')'
            return (
              <div key={b.leave_type} style={{ marginBottom: idx < balances.length - 1 ? 14 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                  <b style={{ fontWeight: 600, color: INK }}>
                    {LEAVE_LABELS[b.leave_type] ?? b.leave_type}
                  </b>
                  <span style={{ color: MUTED }}>{b.remaining_days} / {b.accrued_days} days</span>
                </div>
                <div style={{ height: 8, background: '#eef2ef', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ display: 'block', height: '100%', borderRadius: 99, width: pct + '%', background: barBg }} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{
          background: CARD, borderRadius: 18, boxShadow: SHADOW,
          padding: '14px 16px', border: '1px solid ' + LINE, marginBottom: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="9"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{ fontSize: 13, color: MUTED }}>
              Leave balances not set up yet — contact your manager.
            </p>
          </div>
        </div>
      )}

      {/* ── Request form ─────────────────────────────────────────────────── */}
      {showForm && (
        <div style={{
          background: CARD, borderRadius: 18, boxShadow: SHADOW,
          padding: '18px 16px', border: '1px solid ' + LINE, marginBottom: 22,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{
            fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
            color: MUTED, fontWeight: 600,
          }}>
            New leave request
          </div>

          {/* Leave type — onChange PRESERVED EXACTLY */}
          <div>
            <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 5 }}>
              Leave type
            </label>
            <select
              value={form.leave_type}
              onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
              className="w-full rounded-lg text-sm outline-none"
              style={{ ...INP, padding: '9px 12px' }}
            >
              {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Date range — onChange PRESERVED EXACTLY */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 5 }}>
                From
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full rounded-lg text-sm outline-none"
                style={{ ...INP, padding: '9px 10px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 5 }}>
                To
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full rounded-lg text-sm outline-none"
                style={{ ...INP, padding: '9px 10px' }}
              />
            </div>
          </div>

          {/* Notes — onChange PRESERVED EXACTLY */}
          <div>
            <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 5 }}>
              Notes (optional)
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Reason for leave…"
              className="w-full rounded-lg text-sm outline-none"
              style={{ ...INP, padding: '9px 12px' }}
            />
          </div>

          {/* Error — PRESERVED EXACTLY */}
          {error && <p style={{ fontSize: 12, color: RED, margin: 0 }}>{error}</p>}

          {/* Submit — onClick + disabled PRESERVED EXACTLY */}
          <button
            onClick={submit}
            disabled={submitting}
            style={{
              width: '100%', padding: '11px', borderRadius: 10,
              fontSize: 14, fontWeight: 600,
              background: submitting ? 'rgba(45,82,64,.55)' : DEEP,
              color: '#ffffff',
              border: 'none',
              cursor: submitting ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      )}

      {/* ── Leave history ─────────────────────────────────────────────────── */}
      <div style={{
        fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
        color: MUTED, margin: '0 4px 10px', fontWeight: 600,
      }}>
        Leave history
      </div>

      {leave.length === 0 ? (
        <div style={{
          background: CARD, borderRadius: 20, boxShadow: SHADOW,
          border: '1px solid ' + LINE, padding: '40px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 15, background: SAGE_TINT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px', fontSize: 22,
          }}>
            🏖️
          </div>
          <div style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: 18, fontWeight: 600, color: INK, marginBottom: 6,
          }}>
            No leave requests yet
          </div>
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.55, maxWidth: 240, margin: '0 auto' }}>
            Your leave history will appear here after you submit a request.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {leave.map(req => {
            const st      = statusStyle(req.status)
            const label   = LEAVE_LABELS[req.leave_type] ?? req.leave_type.replace('_', ' ')
            const startFmt = new Date(req.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
            const endFmt   = new Date(req.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
            const daysStr  = req.days_taken + ' day' + (Number(req.days_taken) !== 1 ? 's' : '')
            return (
              <div key={req.id} style={{
                background: CARD, borderRadius: 16,
                boxShadow: SHADOW,
                border: '1px solid ' + LINE,
                borderLeft: '3px solid ' + st.left,
                padding: '14px 16px',
              }}>
                {/* Header row: label + status chip */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', marginBottom: 6, gap: 8,
                }}>
                  <div style={{
                    fontFamily: 'var(--font-display, serif)',
                    fontSize: 16, fontWeight: 600, color: INK,
                  }}>
                    {label}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    padding: '3px 10px', borderRadius: 999,
                    background: st.chipBg, color: st.chipColor,
                    textTransform: 'capitalize', flexShrink: 0,
                  }}>
                    {req.status}
                  </span>
                </div>

                {/* Date range + duration */}
                <div style={{ fontSize: 13, color: MUTED }}>
                  {startFmt} – {endFmt}
                  <span style={{ margin: '0 5px', opacity: 0.45 }}>·</span>
                  {daysStr}
                </div>

                {/* Notes */}
                {req.notes && (
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 5, fontStyle: 'italic' }}>
                    {req.notes}
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
