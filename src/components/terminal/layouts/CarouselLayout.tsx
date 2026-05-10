'use client'
import { LayoutProps, ProductForTerminal } from './types'

function groupByCategory(products: ProductForTerminal[]) {
  return products.reduce((acc, p) => {
    const cat = (p.category ?? 'other').toLowerCase()
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {} as Record<string, ProductForTerminal[]>)
}

function prettyCat(c: string) {
  return c.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

const CAT_EMOJI: Record<string, string> = {
  'beer': '🍺', 'beer & cider': '🍺', 'wine': '🍷', 'wine-red': '🍷',
  'wine-white': '🥂', 'spirits': '🥃', 'whisky': '🥃', 'liqueur': '🍶',
  'coffee': '☕', 'snacks': '🍿', 'mixer': '🥤', 'soft drinks': '🥤',
  'water': '💧', 'food': '🍔', 'other': '📦',
}

export function CarouselLayout({ products, onProductClick }: LayoutProps) {
  const grouped = groupByCategory(products)

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <p style={{
              fontFamily: "'Instrument Serif',Georgia,serif",
              fontSize: 14, fontStyle: 'italic', margin: 0, fontWeight: 500,
              color: 'var(--text-primary)',
            }}>{prettyCat(cat)}</p>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: 0 }}>
              {items.length} items
            </p>
          </div>
          <div style={{
            display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6,
            scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
          }}>
            {items.map(p => (
              <button
                key={p.id}
                onClick={() => onProductClick(p)}
                style={{
                  flexShrink: 0, scrollSnapAlign: 'start', width: 130,
                  background: 'var(--bg-elevated)',
                  border: '1px solid rgba(127,184,151,0.08)',
                  borderRadius: 11, padding: 10, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  boxShadow: 'inset 0 1px 0 rgba(127,184,151,0.06), 0 6px 18px rgba(0,0,0,0.18)',
                  transition: 'all 180ms cubic-bezier(0.22,1,0.36,1)',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'
                  e.currentTarget.style.boxShadow =
                    '0 12px 28px rgba(0,0,0,0.3), 0 0 0 1px rgba(127,184,151,0.18)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)'
                  e.currentTarget.style.boxShadow =
                    'inset 0 1px 0 rgba(127,184,151,0.06), 0 6px 18px rgba(0,0,0,0.18)'
                }}
              >
                <div style={{
                  width: 60, height: 60, borderRadius: 10,
                  background: 'rgba(127,184,151,0.10)',
                  border: '1px solid rgba(127,184,151,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, flexShrink: 0,
                }}>
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                    : CAT_EMOJI[cat] ?? '📦'}
                </div>
                <p style={{
                  fontSize: 10, fontWeight: 500, margin: '4px 0 0', textAlign: 'center',
                  color: 'var(--text-primary)', width: '100%',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{p.name}</p>
                <p style={{
                  fontSize: 13, fontWeight: 600, margin: 0,
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
