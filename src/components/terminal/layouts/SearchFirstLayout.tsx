'use client'
import { LayoutProps, ProductForTerminal } from './types'

export function SearchFirstLayout({
  products, onProductClick, recentProductIds = [], suggestedProductIds = [],
}: LayoutProps) {
  const recent = recentProductIds
    .map(id => products.find(p => p.id === id))
    .filter(Boolean) as ProductForTerminal[]

  const suggested = suggestedProductIds.length
    ? suggestedProductIds.map(id => products.find(p => p.id === id)).filter(Boolean) as ProductForTerminal[]
    : products.slice(0, 4)

  return (
    <div style={{ padding: 12 }}>
      {/* Search hint */}
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid rgba(127,184,151,0.10)',
        borderRadius: 12, padding: '14px 18px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 10,
        color: 'var(--text-tertiary)', fontSize: 13,
        boxShadow: 'inset 0 1px 0 rgba(127,184,151,0.06)',
      }}>
        <span style={{ fontSize: 15 }}>⌕</span>
        <span>Type 2 letters or scan barcode…</span>
        <span style={{
          marginLeft: 'auto', padding: '2px 6px', borderRadius: 4,
          border: '1px solid rgba(127,184,151,0.15)', fontSize: 10,
          color: 'var(--text-tertiary)',
        }}>⌘K</span>
      </div>

      {/* Aria suggestions */}
      {suggested.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.16em', margin: '0 0 8px', color: 'var(--violet)',
          }}>✦ Aria suggests</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {suggested.slice(0, 4).map(p => (
              <ProductTileCompact key={p.id} product={p} onClick={() => onProductClick(p)} />
            ))}
          </div>
        </div>
      )}

      {/* Recent */}
      {recent.length > 0 && (
        <div>
          <p style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.16em', margin: '0 0 8px', color: 'var(--text-tertiary)',
          }}>Recent</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {recent.slice(0, 8).map(p => (
              <ProductTileCompact key={p.id} product={p} onClick={() => onProductClick(p)} />
            ))}
          </div>
        </div>
      )}

      {/* Fallback grid if no recent or suggestions */}
      {recent.length === 0 && suggested.length === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {products.slice(0, 16).map(p => (
            <ProductTileCompact key={p.id} product={p} onClick={() => onProductClick(p)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProductTileCompact({ product, onClick }: { product: ProductForTerminal; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid rgba(127,184,151,0.08)',
        borderRadius: 11, padding: 10, aspectRatio: '0.95',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)',
        boxShadow: 'inset 0 1px 0 rgba(127,184,151,0.06), 0 6px 18px rgba(0,0,0,0.18)',
        transition: 'all 180ms cubic-bezier(0.22,1,0.36,1)',
        width: '100%',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.3), 0 0 0 1px rgba(127,184,151,0.18)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(127,184,151,0.06), 0 6px 18px rgba(0,0,0,0.18)'
      }}
    >
      <div style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(127,184,151,0.25)' }} />
      <div>
        <p style={{ fontSize: 11, fontWeight: 500, margin: 0, color: 'var(--text-primary)' }}>
          {product.name}
        </p>
        <p style={{
          fontSize: 13, fontWeight: 600, margin: '3px 0 0',
          fontFamily: "'JetBrains Mono',monospace",
          color: 'var(--violet)',
        }}>${product.price.toFixed(2)}</p>
      </div>
    </button>
  )
}
