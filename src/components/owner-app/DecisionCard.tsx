'use client'
import { BORDER, SUBTEXT, INK, FONT_MONO, DOMAIN_LABELS, formatDollars } from '@/app/owner/theme'
import type { OwnerDecision } from '@/lib/owner-app/decisions'

export function DecisionCard({ decision, onClick }: { decision: OwnerDecision; onClick?: () => void }) {
  const showFooter = decision.created_by === 'aria' && decision.status === 'pending'
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', background: '#fff',
        border: '1px solid ' + BORDER, borderRadius: 12, padding: 16, cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.06em', color: SUBTEXT, textTransform: 'uppercase' }}>
            {decision.domain ? DOMAIN_LABELS[decision.domain] : '—'}
          </div>
          <div style={{ fontWeight: 600, fontSize: 16, color: INK, marginTop: 4 }}>{decision.title}</div>
          {decision.subtitle && (
            <div style={{ fontSize: 13, color: SUBTEXT, marginTop: 2 }}>{decision.subtitle}</div>
          )}
        </div>
        {decision.amount_cents != null && (
          <div style={{ fontWeight: 700, fontSize: 17, color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {formatDollars(decision.amount_cents)}
          </div>
        )}
      </div>
      {showFooter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12, color: SUBTEXT }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, background: '#d9f54e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: INK }}>a</span>
          Aria prepared this · tap to decide
        </div>
      )}
    </button>
  )
}
