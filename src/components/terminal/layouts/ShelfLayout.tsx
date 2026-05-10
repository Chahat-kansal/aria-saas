'use client'
import { useEffect, useState } from 'react'
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

function getStockStatus(p: ProductForTerminal) {
  if (!p.track_inventory) return 'unlimited'
  const qty = p.stock_quantity ?? 0
  if (qty <= 0) return 'out'
  if (qty <= 5) return 'low'
  return 'normal'
}

function groupByCategory(products: ProductForTerminal[], selectedCategory?: string | null) {
  return products.reduce((acc, p) => {
    const cat = (p.category ?? 'other').toLowerCase()
    if (selectedCategory && cat !== selectedCategory.toLowerCase()) return acc
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {} as Record<string, ProductForTerminal[]>)
}

function ShelfTileImage({ product, cat }: { product: ProductForTerminal; cat: string }) {
  if (product.image_url && product.image_source !== 'pending') {
    return (
      <img
        src={product.image_url}
        alt={product.name}
        loading="lazy"
        width={60}
        height={80}
        style={{ width: 60, height: 80, objectFit: 'contain' }}
      />
    )
  }
  // Bottle silhouette fallback
  return (
    <div style={{
      width: 36, height: 90, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-end',
    }}>
      <div style={{
        width: 12, height: 18, borderRadius: '50% 50% 0 0',
        background: 'rgba(127,184,151,0.25)', border: '1px solid rgba(127,184,151,0.3)', flexShrink: 0,
      }} />
      <div style={{
        width: 8, height: 14, background: 'rgba(127,184,151,0.2)',
        border: '1px solid rgba(127,184,151,0.25)', borderTop: 'none', flexShrink: 0,
      }} />
      <div style={{
        width: 28, height: 52, borderRadius: '4px 4px 8px 8px',
        background: 'rgba(127,184,151,0.18)', borderTop: 'none',
        border: '1px solid rgba(127,184,151,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, flexShrink: 0,
      }}>{CAT_EMOJI[cat] ?? '📦'}</div>
    </div>
  )
}

export function ShelfLayout({ products, onProductClick, selectedCategory }: LayoutProps) {
  const [supportsHover, setSupportsHover] = useState(true)
  useEffect(() => {
    setSupportsHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])

  const grouped = groupByCategory(products, selectedCategory)
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
          }}>{cat.replace(/-/g, ' ')}</p>
          <div style={{
            background: 'var(--bg-elevated)', borderRadius: 11, padding: 16,
            display: 'flex', alignItems: 'flex-end', gap: 18, minHeight: 120,
            overflowX: 'auto', boxShadow: 'inset 0 -2px 0 rgba(127,184,151,0.16)',
            border: '1px solid rgba(127,184,151,0.06)',
          }}>
            {grouped[cat].map(p => {
              const status = getStockStatus(p)
              const isOut = status === 'out'
              return (
                <button
                  key={p.id}
                  onClick={() => !isOut && onProductClick(p)}
                  onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
                  onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)' }}
                  onMouseEnter={supportsHover ? e => {
                    if (!isOut) e.currentTarget.style.transform = 'translateY(-4px)'
                  } : undefined}
                  onMouseLeave={supportsHover ? e => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)'
                  } : undefined}
                  style={{
                    background: 'transparent', border: 'none',
                    cursor: isOut ? 'not-allowed' : 'pointer',
                    pointerEvents: isOut ? 'none' : 'auto',
                    opacity: isOut ? 0.5 : 1,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 4, padding: 4, flexShrink: 0,
                    transition: 'transform 200ms', position: 'relative',
                  }}
                >
                  <ShelfTileImage product={p} cat={cat} />
                  <p style={{
                    fontSize: 10, margin: 0, color: 'var(--text-primary)',
                    maxWidth: 70, textAlign: 'center',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{p.name}</p>
                  <p style={{
                    fontSize: 11, fontWeight: 600, margin: 0,
                    fontFamily: "'JetBrains Mono',monospace", color: 'var(--violet)',
                  }}>${p.price.toFixed(2)}</p>
                  {status === 'low' && (
                    <span style={{
                      position: 'absolute', top: 0, right: 0,
                      fontSize: 8, padding: '1px 4px', borderRadius: 99,
                      background: 'rgba(212,169,94,0.14)', color: 'var(--warning)', fontWeight: 500,
                    }}>{p.stock_quantity} left</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
