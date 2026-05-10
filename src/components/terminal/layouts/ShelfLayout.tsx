'use client'
import { LayoutProps, ProductForTerminal } from './types'

const CAT_EMOJI: Record<string, string> = {
  'beer': '🍺', 'beer & cider': '🍺', 'wine': '🍷', 'wine-red': '🍷',
  'wine-white': '🥂', 'spirits': '🥃', 'whisky': '🥃', 'liqueur': '🍶',
  'coffee': '☕', 'snacks': '🍿', 'mixer': '🥤', 'soft drinks': '🥤',
  'water': '💧', 'food': '🍔', 'other': '📦',
}

const CAT_ORDER = [
  'beer', 'beer & cider', 'wine', 'wine-red', 'wine-white',
  'whisky', 'spirits', 'liqueur', 'coffee', 'snacks', 'mixer', 'soft drinks', 'other',
]

function groupByCategory(products: ProductForTerminal[]) {
  return products.reduce((acc, p) => {
    const cat = (p.category ?? 'other').toLowerCase()
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {} as Record<string, ProductForTerminal[]>)
}

export function ShelfLayout({ products, onProductClick }: LayoutProps) {
  const grouped = groupByCategory(products)
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const ai = CAT_ORDER.indexOf(a)
    const bi = CAT_ORDER.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sortedCategories.map(cat => (
        <div key={cat}>
          <p style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.16em', color: 'var(--text-tertiary)', margin: '0 0 8px',
          }}>
            {cat.replace('-', ' ')}
          </p>
          <div style={{
            background: 'var(--bg-elevated)',
            borderRadius: 11, padding: 16,
            display: 'flex', alignItems: 'flex-end', gap: 18,
            minHeight: 120, overflowX: 'auto',
            boxShadow: 'inset 0 -2px 0 rgba(127,184,151,0.16)',
            border: '1px solid rgba(127,184,151,0.06)',
          }}>
            {grouped[cat].map(p => (
              <button
                key={p.id}
                onClick={() => onProductClick(p)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 4, padding: 4, flexShrink: 0,
                  transition: 'transform 200ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
              >
                {/* Bottle silhouette */}
                <div style={{
                  width: 36, height: 90, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'flex-end', position: 'relative',
                }}>
                  <div style={{
                    width: 12, height: 18, borderRadius: '50% 50% 0 0',
                    background: 'rgba(127,184,151,0.25)',
                    border: '1px solid rgba(127,184,151,0.3)',
                    flexShrink: 0,
                  }} />
                  <div style={{
                    width: 8, height: 14, background: 'rgba(127,184,151,0.2)',
                    border: '1px solid rgba(127,184,151,0.25)', borderTop: 'none',
                    flexShrink: 0,
                  }} />
                  <div style={{
                    width: 28, height: 52, borderRadius: '4px 4px 8px 8px',
                    background: 'rgba(127,184,151,0.18)', borderTop: 'none',
                    border: '1px solid rgba(127,184,151,0.28)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, flexShrink: 0,
                  }}>
                    {CAT_EMOJI[cat] ?? '📦'}
                  </div>
                </div>
                <p style={{
                  fontSize: 10, margin: 0, color: 'var(--text-primary)',
                  maxWidth: 70, textAlign: 'center',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{p.name}</p>
                <p style={{
                  fontSize: 11, fontWeight: 600, margin: 0,
                  fontFamily: "'JetBrains Mono',monospace",
                  color: 'var(--violet)',
                }}>${p.price.toFixed(2)}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
