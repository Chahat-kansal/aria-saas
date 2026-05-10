'use client'
import { LayoutProps } from './types'

const HEIGHTS = [200, 160, 240, 180, 220, 170, 250, 190]

export function MasonryLayout({ products, onProductClick }: LayoutProps) {
  return (
    <div style={{ columnCount: 4, columnGap: 8, padding: 8 }}>
      {products.map((p, i) => {
        const height = HEIGHTS[i % HEIGHTS.length]
        const isHero = i === 0 || i === 4

        return (
          <button
            key={p.id}
            onClick={() => onProductClick(p)}
            style={{
              display: 'block', width: '100%', height,
              marginBottom: 8,
              background: 'var(--bg-elevated)',
              border: '1px solid rgba(127,184,151,0.08)',
              borderRadius: 11, padding: 10, cursor: 'pointer',
              breakInside: 'avoid', textAlign: 'left',
              color: 'var(--text-primary)',
              boxShadow: 'inset 0 1px 0 rgba(127,184,151,0.06), 0 6px 18px rgba(0,0,0,0.18)',
              transition: 'all 180ms cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow =
                '0 12px 28px rgba(0,0,0,0.3), 0 0 0 1px rgba(127,184,151,0.18)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow =
                'inset 0 1px 0 rgba(127,184,151,0.06), 0 6px 18px rgba(0,0,0,0.18)'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {isHero ? (
                  <span style={{
                    fontSize: 9, padding: '2px 7px', borderRadius: 99,
                    background: 'rgba(127,184,151,0.12)', color: 'var(--violet)', fontWeight: 500,
                  }}>Hero</span>
                ) : (
                  <div style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(127,184,151,0.25)' }} />
                )}
                {p.stock_quantity != null && p.stock_quantity < 10 && (
                  <span style={{
                    fontSize: 9, padding: '2px 7px', borderRadius: 99,
                    background: 'rgba(201,112,112,0.14)', color: 'var(--destructive)',
                  }}>Low</span>
                )}
              </div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 500, margin: 0, color: 'var(--text-primary)' }}>
                  {p.name}
                </p>
                <p style={{
                  fontSize: isHero ? 16 : 13, fontWeight: 600, margin: '4px 0 0',
                  fontFamily: "'JetBrains Mono',monospace",
                  color: 'var(--violet)',
                }}>${p.price.toFixed(2)}</p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
