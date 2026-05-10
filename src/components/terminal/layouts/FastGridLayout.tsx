'use client'
import { LayoutProps } from './types'

export function FastGridLayout({ products, onProductClick, showStock = true }: LayoutProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 8 }}>
      {products.map(p => (
        <button
          key={p.id}
          onClick={() => onProductClick(p)}
          style={{
            background: 'var(--bg-glass)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(127,184,151,0.08)',
            borderRadius: 11,
            padding: 10,
            aspectRatio: '0.92',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            cursor: 'pointer',
            boxShadow: 'inset 0 1px 0 rgba(127,184,151,0.06), 0 6px 18px rgba(0,0,0,0.18)',
            transition: 'all 200ms cubic-bezier(0.22,1,0.36,1)',
            color: 'var(--text-primary)',
            textAlign: 'left',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow =
              'inset 0 1px 0 rgba(127,184,151,0.10), 0 12px 28px rgba(0,0,0,0.3), 0 0 0 1px rgba(127,184,151,0.18)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow =
              'inset 0 1px 0 rgba(127,184,151,0.06), 0 6px 18px rgba(0,0,0,0.18)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, background: getCategoryColor(p.category) }} />
            {showStock && p.stock_quantity != null && p.stock_quantity < 10 && (
              <span style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 99,
                background: 'rgba(201,112,112,0.14)', color: 'var(--destructive)', fontWeight: 500,
              }}>Low</span>
            )}
          </div>
          <div>
            <p style={{
              fontSize: 11, fontWeight: 500, margin: 0, color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{p.name}</p>
            {p.description && (
              <p style={{
                fontSize: 9, margin: '1px 0 0', color: 'var(--text-tertiary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{p.description}</p>
            )}
            <p style={{
              fontSize: 14, fontWeight: 600, margin: '4px 0 0',
              fontFamily: "'JetBrains Mono',monospace",
              color: 'var(--violet)',
            }}>${p.price.toFixed(2)}</p>
          </div>
        </button>
      ))}
    </div>
  )
}

function getCategoryColor(category: string | null | undefined): string {
  const map: Record<string, string> = {
    'beer': '#B8854A', 'beer & cider': '#B8854A',
    'whisky': '#8B5A2B', 'spirits': '#94795E',
    'wine': '#7B4754', 'wine-red': '#7B4754', 'wine-white': '#9C9560',
    'liqueur': '#A85F3F', 'coffee': '#6B4423',
    'snacks': '#D4A95E', 'mixer': '#6B96B0', 'soft drinks': '#6B96B0',
  }
  return map[category?.toLowerCase() ?? ''] ?? '#7FB897'
}
