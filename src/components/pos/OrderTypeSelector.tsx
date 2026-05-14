'use client'

export type OrderType = 'takeaway' | 'dine_in' | 'delivery' | 'pickup' | 'drive_thru' | 'phone' | 'catering'

const ORDER_TYPES: { id: OrderType; label: string; icon: string }[] = [
  { id: 'takeaway',   label: 'Takeaway',   icon: '🥤' },
  { id: 'dine_in',   label: 'Dine-in',    icon: '🪑' },
  { id: 'pickup',    label: 'Pickup',      icon: '📦' },
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
      display: 'flex', gap: 4, padding: '8px 12px',
      borderBottom: '1px solid rgba(127,184,151,0.1)',
      overflowX: 'auto', scrollbarWidth: 'none',
    }}>
      {ORDER_TYPES.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
            fontSize: 11, fontWeight: value === t.id ? 700 : 400, border: 'none',
            background: value === t.id ? 'rgba(127,184,151,0.2)' : 'rgba(255,255,255,0.04)',
            color: value === t.id ? '#7FB897' : 'rgba(255,255,255,0.45)',
            outline: value === t.id ? '1px solid rgba(127,184,151,0.4)' : 'none',
            whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0,
            transition: 'all 0.12s',
          }}>
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  )
}