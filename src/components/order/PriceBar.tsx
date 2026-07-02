'use client'

interface Props {
  total: number
  points: number
  onClick?: () => void
}

export function PriceBar({ total, points, onClick }: Props) {
  const displayTotal = (Number(total) || 0).toFixed(2)

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        zIndex: 50,
        padding: '12px 24px 28px',
        background: 'rgba(250,250,250,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Earns caption above CTA */}
      <p style={{
        margin: 0,
        textAlign: 'center',
        fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
        fontSize: 12,
        fontWeight: 500,
        color: '#6b7280',
        letterSpacing: '0.01em',
      }}>
        {'Earns ' + points + ' loyalty points'}
      </p>

      {/* Full-width lime pill CTA */}
      <button
        onClick={onClick}
        style={{
          width: '100%',
          padding: '15px 20px',
          borderRadius: 9999,
          border: 'none',
          background: '#d9f54e',
          color: '#0a0a0a',
          fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: '-0.01em',
          cursor: onClick ? 'pointer' : 'default',
          boxShadow: '0 4px 20px rgba(217,245,78,0.35)',
        }}
      >
        {'Add to order · $' + displayTotal}
      </button>
    </div>
  )
}