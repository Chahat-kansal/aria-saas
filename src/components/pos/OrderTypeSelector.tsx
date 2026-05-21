'use client'

export type OrderType = 'takeaway' | 'dine_in' | 'delivery' | 'pickup' | 'drive_thru' | 'phone' | 'catering'

const ORDER_TYPES: { id: OrderType; label: string; icon: string }[] = [
  { id: 'takeaway',   label: 'Takeaway',   icon: '🥤' },
  { id: 'dine_in',   label: 'Dine-in',    icon: '🩑' },
  { id: 'pickup',    label: 'Pickup',     icon: '📦' },
  { id: 'delivery',  label: 'Delivery',   icon: '🛵' },
  { id: 'drive_thru',label: 'Drive-thru', icon: '🚗' },
  { id: 'phone',     label: 'Phone',      icon: '📞' },
]

interface Props {
  value: OrderType
  onChange: (type: OrderType) => void
}

export function OrderTypeSelector({ value, onChange }: Props) {
  return (
    <div style={{
      display: 'flex', gap: 4, padding: '6px 12px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-surface)',
      overflowX: 'auto', scrollbarWidth: 'none',
    }}>
      {ORDER_TYPES.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
            fontSize: 11, fontWeight: value === t.id ? 700 : 400, border: 'none',
            background: value === t.id ? 'var(--violet-dim)' : 'transparent',
            color: value === t.id ? 'var(--violet)' : 'var(--text-secondary)',
            outline: value === t.id ? '1.5px solid var(--border-violet)' : '1px solid var(--border-subtle)',
            whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0,
            transition: 'all 0.12s',
          }}>
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  )
}
