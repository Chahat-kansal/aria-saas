'use client'
import React, { useEffect, useState } from 'react'
import { LayoutProps, ProductForTerminal } from './types'

const HEIGHTS = [200, 160, 240, 180, 220, 170, 250, 190]
const MAX_ITEMS = 200

function getStockStatus(p: ProductForTerminal) {
  if (!p.track_inventory) return 'unlimited'
  const qty = p.stock_quantity ?? 0
  if (qty <= 0) return 'out'
  if (qty <= 5) return 'low'
  return 'normal'
}

function ProductImage({ product, size }: { product: ProductForTerminal; size: number }) {
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
    <div style={{ width: size, height: size, borderRadius: 6, background: 'rgba(127,184,151,0.20)' }} />
  )
}

export const MasonryLayout = React.memo(function MasonryLayout({ products, onProductClick }: LayoutProps) {
  const [supportsHover, setSupportsHover] = useState(true)
  useEffect(() => {
    setSupportsHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])

  const capped = products.slice(0, MAX_ITEMS)
  const hasMore = products.length > MAX_ITEMS

  return (
    <>
      <div style={{ columnCount: 4, columnGap: 8, padding: 8 }}>
        {capped.map((p, i) => {
          const height = HEIGHTS[i % HEIGHTS.length]
          const isHero = i === 0 || i === 4
          const status = getStockStatus(p)
          const isOut = status === 'out'
          const shadowBase = 'inset 0 1px 0 rgba(127,184,151,0.06), 0 6px 18px rgba(0,0,0,0.18)'

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
                  '0 12px 28px rgba(0,0,0,0.3), 0 0 0 1px rgba(127,184,151,0.18)'
              } : undefined}
              onMouseLeave={supportsHover ? e => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)'
                e.currentTarget.style.boxShadow = shadowBase
              } : undefined}
              style={{
                display: 'block', width: '100%', height,
                marginBottom: 8,
                background: 'var(--bg-elevated)',
                border: '1px solid rgba(127,184,151,0.08)',
                borderRadius: 11, padding: 10,
                cursor: isOut ? 'not-allowed' : 'pointer',
                pointerEvents: isOut ? 'none' : 'auto',
                opacity: isOut ? 0.5 : 1,
                breakInside: 'avoid', textAlign: 'left',
                color: 'var(--text-primary)', position: 'relative',
                boxShadow: shadowBase,
                transition: 'all 180ms cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    {isHero ? (
                      <span style={{
                        fontSize: 9, padding: '2px 7px', borderRadius: 99,
                        background: 'rgba(127,184,151,0.12)', color: 'var(--violet)', fontWeight: 500,
                      }}>Hero</span>
                    ) : (
                      <ProductImage product={p} size={36} />
                    )}
                  </div>
                  {status === 'out' && (
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 99,
                      background: 'rgba(201,112,112,0.16)', color: 'var(--destructive)', fontWeight: 600,
                    }}>OUT</span>
                  )}
                  {status === 'low' && (
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 99,
                      background: 'rgba(212,169,94,0.14)', color: 'var(--warning)', fontWeight: 500,
                    }}>{p.stock_quantity} left</span>
                  )}
                </div>
                {isHero && (
                  <ProductImage product={p} size={80} />
                )}
                <div>
                  <p style={{ fontSize: 10, fontWeight: 500, margin: 0, color: 'var(--text-primary)' }}>
                    {p.name}
                  </p>
                  <p style={{
                    fontSize: isHero ? 16 : 13, fontWeight: 600, margin: '4px 0 0',
                    fontFamily: "'JetBrains Mono',monospace", color: 'var(--violet)',
                  }}>${p.price.toFixed(2)}</p>
                </div>
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
})
