'use client'
import { INK, BORDER, DOMAIN_LABELS } from '@/app/owner/theme'
import { DOMAINS } from '@/lib/owner-app/decisions'

export function DomainChips({
  counts, active, onChange,
}: {
  counts: Record<string, number>
  active: string
  onChange: (domain: string) => void
}) {
  const chips = [{ key: 'all', label: 'All' }, ...DOMAINS.map(d => ({ key: d, label: DOMAIN_LABELS[d] }))]
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
      {chips.map(c => {
        const isActive = c.key === active
        const count = counts[c.key] ?? 0
        return (
          <button
            key={c.key}
            onClick={() => onChange(c.key)}
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
              border: '1px solid ' + (isActive ? INK : BORDER),
              background: isActive ? INK : 'transparent',
              color: isActive ? '#fff' : INK,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {c.label} {count}
          </button>
        )
      })}
    </div>
  )
}
