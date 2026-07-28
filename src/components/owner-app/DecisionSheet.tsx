'use client'
import { useState } from 'react'
import { INK, SUBTEXT, BORDER, FONT_MONO, DOMAIN_LABELS, formatDollars } from '@/app/owner/theme'
import type { OwnerDecision } from '@/lib/owner-app/decisions'
import { StepUpSheet } from './StepUpSheet'

interface Props {
  decision: OwnerDecision
  business_id: string
  onClose: () => void
  onResolved: (updated: OwnerDecision) => void
}

// OWNER-APP PH-1 — the bottom sheet the brief describes: payload.rows / payload.diff (before/
// after) / aria_reason, approve/decline, and the step-up sheet for money kinds before approve.
export function DecisionSheet({ decision, business_id, onClose, onResolved }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showStepup, setShowStepup] = useState(false)

  async function act(action: 'approve' | 'decline', stepup_token?: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/owner/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id, id: decision.id, action, stepup_token }),
      })
      const json = await res.json()
      if (res.status === 428) { setShowStepup(true); setBusy(false); return }
      if (!res.ok) { setError(json.error ?? 'Something went wrong'); setBusy(false); return }
      onResolved(json.decision)
    } catch {
      setError('Network error — try again')
      setBusy(false)
    }
  }

  const rows = (decision.payload?.rows as Array<Record<string, unknown>> | undefined) ?? null
  const diff = decision.payload?.diff as { before?: string; after?: string } | undefined

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(10,10,10,0.4)' }} />
      <div style={{ position: 'relative', width: '100%', background: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: BORDER, margin: '0 auto 16px' }} />

        <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.06em', color: SUBTEXT, textTransform: 'uppercase' }}>
          {decision.domain ? DOMAIN_LABELS[decision.domain] : '—'}
        </div>
        <div style={{ fontWeight: 700, fontSize: 20, color: INK, marginTop: 4 }}>{decision.title}</div>
        {decision.subtitle && <div style={{ fontSize: 14, color: SUBTEXT, marginTop: 4 }}>{decision.subtitle}</div>}
        {decision.amount_cents != null && (
          <div style={{ fontWeight: 700, fontSize: 28, color: INK, marginTop: 12, fontVariantNumeric: 'tabular-nums' }}>
            {formatDollars(decision.amount_cents)}
          </div>
        )}

        {rows && rows.length > 0 && (
          <div style={{ marginTop: 20, border: '1px solid ' + BORDER, borderRadius: 12, overflow: 'hidden' }}>
            {rows.map((r, i) => (
              <div key={i} style={{ padding: '10px 14px', fontSize: 13, color: INK, borderTop: i > 0 ? '1px solid ' + BORDER : undefined, display: 'flex', justifyContent: 'space-between' }}>
                <span>{Object.values(r)[0] as string}</span>
                <span style={{ color: SUBTEXT }}>{Object.values(r).slice(1).join(' · ')}</span>
              </div>
            ))}
          </div>
        )}

        {diff && (
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: '#f3f3f3', color: SUBTEXT }}>{diff.before}</span>
            <span style={{ color: SUBTEXT }}>→</span>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: '#d9f54e', color: INK, fontWeight: 600 }}>{diff.after}</span>
          </div>
        )}

        {decision.aria_reason && (
          <div style={{ marginTop: 20, padding: 14, background: '#fafafa', borderRadius: 12, fontSize: 13, color: INK, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 600 }}>Aria's reasoning: </span>{decision.aria_reason}
          </div>
        )}

        {error && <div style={{ marginTop: 16, fontSize: 13, color: '#b91c1c' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button
            disabled={busy}
            onClick={() => act('decline')}
            style={{ flex: 1, padding: '14px 0', borderRadius: 999, border: '1px solid ' + BORDER, background: '#fff', color: INK, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
          >
            Decline
          </button>
          <button
            disabled={busy}
            onClick={() => act('approve')}
            style={{ flex: 1, padding: '14px 0', borderRadius: 999, border: 'none', background: INK, color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
          >
            Approve
          </button>
        </div>
      </div>

      {showStepup && (
        <StepUpSheet
          onCancel={() => setShowStepup(false)}
          onVerified={(token) => { setShowStepup(false); act('approve', token) }}
        />
      )}
    </div>
  )
}
