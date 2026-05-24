'use client'
import React, { useEffect, useState } from 'react'
import { LayoutProps, ProductForTerminal } from './types'

function getStockStatus(p: ProductForTerminal) {
  if (!p.track_inventory) return 'unlimited'
  const qty = p.stock_quantity ?? 0
  if (qty <= 0) return 'out'
  if (qty <= 5) return 'low'
  return 'normal'
}

function ProductTileCompact({
  product, onClick, supportsHover,
}: {
  product: ProductForTerminal
  onClick: () => void
  supportsHover: boolean
}) {
  const status = getStockStatus(product)
  const isOut = status === 'out'
  const shadowBase = 'inset 0 1px 0 rgba(127,184,151,0.06), 0 6px 18px rgba(0,0,0,0.18)'

  return (
    <button
      onClick={() => !isOut && onClick()}
      onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
      onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)' }}
      onMouseEnter={supportsHover ? e => {
        if (isOut) return
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.3), 0 0 0 1px rgba(127,184,151,0.18)'
      } : undefined}
      onMouseLeave={supportsHover ? e => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)'
        e.currentTarget.style.boxShadow = shadowBase
      } : undefined}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid rgba(127,184,151,0.08)',
        borderRadius: 11, padding: 10, aspectRatio: '0.95',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        cursor: isOut ? 'not-allowed' : 'pointer',
        pointerEvents: isOut ? 'none' : 'auto',
        opacity: isOut ? 0.5 : 1,
        textAlign: 'left', color: 'var(--text-primary)',
        boxShadow: shadowBase,
        transition: 'all 180ms cubic-bezier(0.22,1,0.36,1)',
        width: '100%', position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {product.image_url && product.image_source !== 'pending'
          ? <img src={product.image_url} alt={product.name} loading="lazy" width={28} height={28}
                  style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 5 }} />
          : <div style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(127,184,151,0.25)' }} />}
        {status === 'out' && (
          <span style={{
            fontSize: 8, padding: '1px 4px', borderRadius: 99,
            background: 'rgba(201,112,112,0.16)', color: 'var(--destructive)', fontWeight: 600,
          }}>OUT</span>
        )}
        {status === 'low' && (
          <span style={{
            fontSize: 8, padding: '1px 4px', borderRadius: 99,
            background: 'rgba(212,169,94,0.14)', color: 'var(--warning)', fontWeight: 500,
          }}>{product.stock_quantity} left</span>
        )}
      </div>
      <div>
        <p style={{ fontSize: 11, fontWeight: 500, margin: 0, color: 'var(--text-primary)' }}>
          {product.name}
        </p>
        <p style={{
          fontSize: 13, fontWeight: 600, margin: '3px 0 0',
          fontFamily: "'JetBrains Mono',monospace", color: 'var(--violet)',
        }}>${product.price.toFixed(2)}</p>
      </div>
    </button>
  )
}

export const SearchFirstLayout = React.memo(function SearchFirstLayout({
  products, onProductClick, recentProductIds = [], suggestedProductIds = [],
}: LayoutProps) {
  const [supportsHover, setSupportsHover] = useState(true)
  useEffect(() => {
    setSupportsHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])

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
        background: 'var(--bg-elevated)', border: '1px solid rgba(127,184,151,0.10)',
        borderRadius: 12, padding: '14px 18px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 10,
        color: 'var(--text-tertiary)', fontSize: 13,
        boxShadow: 'inset 0 1px 0 rgba(127,184,151,0.06)',
      }}>
        <span style={{ fontSize: 15 }}>⌕</span>
        <span>Type 2 letters or scan barcode…</span>
        <span style={{
          marginLeft: 'auto', padding: '2px 6px', borderRadius: 4,
          border: '1px solid rgba(127,184,151,0.15)', fontSize: 10, color: 'var(--text-tertiary)',
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
              <ProductTileCompact
                key={p.id} product={p} supportsHover={supportsHover}
                onClick={() => onProductClick(p)}
              />
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
              <ProductTileCompact
                key={p.id} product={p} supportsHover={supportsHover}
                onClick={() => onProductClick(p)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Fallback grid */}
      {recent.length === 0 && suggested.length === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {products.slice(0, 16).map(p => (
            <ProductTileCompact
              key={p.id} product={p} supportsHover={supportsHover}
              onClick={() => onProductClick(p)}
            />
          ))}
        </div>
      )}
    </div>
  )
})
