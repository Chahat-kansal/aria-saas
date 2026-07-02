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
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 48px)',
        maxWidth: 420,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* CTA button */}
      <button
        onClick={onClick}
        style={{
          width: '100%',
          padding: '14px 20px',
          borderRadius: 16,
          border: 'none',
          background: '#d9f54e',
          color: '#2f3a06',
          fontFamily: 'Inter, sans-serif',
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          cursor: onClick ? 'pointer' : 'default',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(217,245,78,0.30), 0 2px 8px rgba(0,0,0,0.12)',
        }}
      >
        {'Add to order · $' + displayTotal}
      </button>

      {/* Points line */}
      <p
        style={{
          margin: 0,
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
          fontSize: 12,
          fontWeight: 500,
          color: '#6b7280',
          letterSpacing: '0.01em',
        }}
      >
        {'Earns ' + points + ' points'}
      </p>
    </div>
  )
}