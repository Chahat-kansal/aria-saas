'use client'
import { useEffect, useState } from 'react'
import { LayoutProps, ProductForTerminal } from './types'

function groupByCategory(products: ProductForTerminal[], selectedCategory?: string | null) {
  return products.reduce((acc, p) => {
    const cat = (p.category ?? 'other').toLowerCase()
    if (selectedCategory && cat !== selectedCategory.toLowerCase()) return acc
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

function getStockStatus(p: ProductForTerminal) {
  if (!p.track_inventory) return 'unlimited'
  const qty = p.stock_quantity ?? 0
  if (qty <= 0) return 'out'
  if (qty <= 5) return 'low'
  return 'normal'
}

export function CarouselLayout({ products, onProductClick, selectedCategory }: LayoutProps) {
  const [supportsHover, setSupportsHover] = useState(true)
  useEffect(() => {
    setSupportsHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])

  const grouped = groupByCategory(products, selectedCategory)

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
            {items.map(p => {
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
                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'
                    e.currentTarget.style.boxShadow =
                      '0 12px 28px rgba(0,0,0,0.3), 0 0 0 1px rgba(127,184,151,0.18)'
                  } : undefined}
                  onMouseLeave={supportsHover ? e => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)'
                    e.currentTarget.style.boxShadow = shadowBase
                  } : undefined}
                  style={{
                    flexShrink: 0, scrollSnapAlign: 'start', width: 130,
                    background: 'var(--bg-elevated)',
                    border: '1px solid rgba(127,184,151,0.08)',
                    borderRadius: 11, padding: 10,
                    cursor: isOut ? 'not-allowed' : 'pointer',
                    pointerEvents: isOut ? 'none' : 'auto',
                    opacity: isOut ? 0.5 : 1,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    boxShadow: shadowBase,
                    transition: 'all 180ms cubic-bezier(0.22,1,0.36,1)',
                    color: 'var(--text-primary)', position: 'relative',
                  }}
                >
                  <div style={{
                    width: 60, height: 60, borderRadius: 10,
                    background: 'rgba(127,184,151,0.10)',
                    border: '1px solid rgba(127,184,151,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28, flexShrink: 0, overflow: 'hidden',
                  }}>
                    {p.image_url && p.image_source !== 'pending'
                      ? <img src={p.image_url} alt={p.name} loading="lazy" width={60} height={60}
                              style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 10 }} />
                      : CAT_EMOJI[cat] ?? '📦'}
                  </div>
                  <p style={{
                    fontSize: 10, fontWeight: 500, margin: '4px 0 0', textAlign: 'center',
                    color: 'var(--text-primary)', width: '100%',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{p.name}</p>
                  <p style={{
                    fontSize: 13, fontWeight: 600, margin: 0,
                    fontFamily: "'JetBrains Mono',monospace", color: 'var(--violet)',
                  }}>${p.price.toFixed(2)}</p>
                  {status === 'low' && (
                    <span style={{
                      position: 'absolute', top: 6, right: 6,
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
