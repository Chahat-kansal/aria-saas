'use client'
import { useEffect, useState } from 'react'
import { LayoutProps, ProductForTerminal } from './types'

const MAX_ITEMS = 200

function getStockStatus(p: ProductForTerminal) {
  if (!p.track_inventory) return 'unlimited'
  const qty = p.stock_quantity ?? 0
  if (qty <= 0) return 'out'
  if (qty <= 5) return 'low'
  if (qty <= 10) return 'limited'
  return 'normal'
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

function ProductImage({ product, size = 36 }: { product: ProductForTerminal; size?: number }) {
  if (product.image_url && product.image_source !== 'pending') {
    return (
      <img
        src={product.image_url}
        alt={product.name}
        loading="lazy"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: 6 }}
      />
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 6, background: getCategoryColor(product.category) }} />
  )
}

export function FastGridLayout({ products, onProductClick, showStock = true }: LayoutProps) {
  const [supportsHover, setSupportsHover] = useState(true)
  useEffect(() => {
    setSupportsHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])

  const capped = products.slice(0, MAX_ITEMS)
  const hasMore = products.length > MAX_ITEMS

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 8 }}>
        {capped.map(p => {
          const status = getStockStatus(p)
          const isOut = status === 'out'
          const shadowBase = 'inset 0 1px 0 rgba(127,184,151,0.06), 0 6px 18px rgba(0,0,0,0.18)'
          const shadowLimited = `${shadowBase}, 0 0 0 1px rgba(212,169,94,0.3) inset`

          return (
            <button
              key={p.id}
              onClick={() => !isOut && onProductClick(p)}
              onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
              onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)' }}
              onMouseEnter={supportsHover ? e => {
                if (isOut) return
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow =
                  'inset 0 1px 0 rgba(127,184,151,0.10), 0 12px 28px rgba(0,0,0,0.3), 0 0 0 1px rgba(127,184,151,0.18)'
              } : undefined}
              onMouseLeave={supportsHover ? e => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)'
                e.currentTarget.style.boxShadow = status === 'limited' ? shadowLimited : shadowBase
              } : undefined}
              style={{
                background: 'var(--bg-glass)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(127,184,151,0.08)',
                borderRadius: 11, padding: 10,
                aspectRatio: '0.92',
                display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: isOut ? 'not-allowed' : 'pointer',
                pointerEvents: isOut ? 'none' : 'auto',
                opacity: isOut ? 0.5 : 1,
                boxShadow: status === 'limited' ? shadowLimited : shadowBase,
                transition: 'all 200ms cubic-bezier(0.22,1,0.36,1)',
                color: 'var(--text-primary)',
                textAlign: 'left',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <ProductImage product={p} size={36} />
                {showStock && isOut && (
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 99,
                    background: 'rgba(201,112,112,0.16)', color: 'var(--destructive)', fontWeight: 600,
                    letterSpacing: '0.08em',
                  }}>OUT</span>
                )}
                {showStock && status === 'low' && (
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 99,
                    background: 'rgba(212,169,94,0.14)', color: 'var(--warning)', fontWeight: 500,
                  }}>{p.stock_quantity} left</span>
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
                  fontFamily: "'JetBrains Mono',monospace", color: 'var(--violet)',
                }}>${p.price.toFixed(2)}</p>
              </div>
            </button>
          )
        })}
      </div>
      {hasMore && (
        <p style={{
          textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)',
          padding: '8px 0 16px',
        }}>
          Showing first {MAX_ITEMS} of {products.length} products — search to find more
        </p>
      )}
    </>
  )
}
