'use client'
import React, { useEffect, useState } from 'react'
import {
  DndContext, closestCenter,
  DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, rectSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { LayoutProps, ProductForTerminal } from './types'
import { ProductImage } from '@/components/terminal/ProductImage'

const MAX_ITEMS = 200

interface FastGridProps extends LayoutProps {
  customising?: boolean
  onReorder?: (ids: string[]) => void
}

function getStockStatus(p: ProductForTerminal) {
  if (!p.track_inventory) return 'unlimited'
  const qty = p.stock_quantity ?? 0
  if (qty <= 0) return 'out'
  if (qty <= 5) return 'low'
  if (qty <= 10) return 'limited'
  return 'normal'
}

function StockPip({ status, qty }: { status: string; qty: number }) {
  if (status === 'unlimited' || status === 'normal') return null
  const color = status === 'out' ? '#C97070' : status === 'low' ? '#D4A95E' : '#8FCAA5'
  const label = status === 'out' ? 'Out' : `${qty}`
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color, fontWeight: 600 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}88`, flexShrink: 0 }}/>
      {label}
    </span>
  )
}

function txCss(t: { x: number; y: number; scaleX: number; scaleY: number } | null): string | undefined {
  if (!t) return undefined
  return 'translate3d(' + t.x + 'px,' + t.y + 'px,0)'
}

function SortableProductTile({ p, isDragging, children }: {
  p: ProductForTerminal
  isDragging: boolean
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: p.id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: txCss(transform),
        transition,
        opacity: isDragging ? 0 : 1,
        cursor: 'grab',
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

export const FastGridLayout = React.memo(function FastGridLayout({
  products, onProductClick, showStock = true, customising, onReorder,
}: FastGridProps) {
  const [supportsHover, setSupportsHover] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    setSupportsHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const capped = products.slice(0, MAX_ITEMS)
  const hasMore = products.length > MAX_ITEMS

  const shadowBase = 'inset 0 1px 0 rgba(127,184,151,0.08), 0 6px 18px rgba(0,0,0,0.25)'
  const shadowHover = 'inset 0 1px 0 rgba(127,184,151,0.16), 0 16px 32px rgba(0,0,0,0.4), 0 0 24px rgba(127,184,151,0.20)'

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = products.map(p => p.id)
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder?.(arrayMove(ids, oldIndex, newIndex))
    }
  }

  const renderTile = (p: ProductForTerminal) => {
    const status = getStockStatus(p)
    const isOut = status === 'out'
    const dollars = Math.floor(p.price)
    const cents = Math.round((p.price - dollars) * 100).toString().padStart(2, '0')
    const productForImage = {
      id: p.id,
      name: p.name,
      category: p.category,
      container_type: p.container_type,
      image_url: p.image_url,
      image_source: p.image_source,
    }
    return (
      <button
        key={p.id}
        onClick={() => !isOut && onProductClick(p)}
        onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
        onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)' }}
        onMouseEnter={supportsHover ? e => {
          if (isOut) return
          e.currentTarget.style.transform = 'translateY(-3px)'
          e.currentTarget.style.boxShadow = shadowHover
          e.currentTarget.style.borderColor = 'var(--terminal-sage-bright, #8FCAA5)'
        } : undefined}
        onMouseLeave={supportsHover ? e => {
          e.currentTarget.style.transform = ''
          e.currentTarget.style.boxShadow = shadowBase
          e.currentTarget.style.borderColor = 'var(--terminal-sage-rim, rgba(127,184,151,0.18))'
        } : undefined}
        onMouseDown={e => { e.currentTarget.style.transform = 'translateY(0) scale(0.96)' }}
        onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-3px)' }}
        style={{
          background: 'linear-gradient(180deg, var(--terminal-bg-elevated,#18271F) 0%, var(--terminal-bg-elevated-2,#1D2E25) 100%)',
          border: '1px solid var(--terminal-sage-rim, rgba(127,184,151,0.18))',
          borderRadius: 14,
          padding: '14px 12px 12px',
          display: 'flex', flexDirection: 'column', gap: 8,
          cursor: customising ? 'inherit' : isOut ? 'not-allowed' : 'pointer',
          opacity: isOut ? 0.45 : 1,
          boxShadow: shadowBase,
          transition: 'all 250ms cubic-bezier(0.16,1,0.3,1)',
          color: 'var(--text-primary)',
          textAlign: 'left',
          position: 'relative',
          overflow: 'hidden',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', height: 88, position: 'relative' }}>
          <ProductImage product={productForImage} size={88} showShadow={!isOut} />
        </div>
        <p style={{
          fontSize: 11, fontWeight: 600, margin: 0, color: 'var(--text-primary)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden', lineHeight: 1.35,
        }}>{p.name}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          <div style={{ lineHeight: 1 }}>
            {p.price === 0 ? (
              <span style={{
                fontFamily: "var(--font-ui,'Inter',system-ui,sans-serif)",
                fontStyle: 'normal', fontWeight: 500,
                fontSize: 11, color: 'rgba(127,184,151,0.4)',
              }}>No price set</span>
            ) : (
              <span style={{
                fontFamily: "var(--font-ui,'Inter',system-ui,sans-serif)",
                fontStyle: 'normal', fontWeight: 700,
                fontSize: 15, letterSpacing: '-0.01em',
                color: 'var(--terminal-sage, #7FB897)',
              }}>
                ${dollars}<span style={{ fontSize: 11, fontWeight: 500 }}>.{cents}</span>
              </span>
            )}
          </div>
          {showStock && <StockPip status={status} qty={p.stock_quantity ?? 0} />}
        </div>
      </button>
    )
  }

  const activeProduct = activeId ? products.find(p => p.id === activeId) : null

  if (customising && onReorder) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={capped.map(p => p.id)} strategy={rectSortingStrategy}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, padding: 10 }}>
            {capped.map(p => (
              <SortableProductTile key={p.id} p={p} isDragging={activeId === p.id}>
                {renderTile(p)}
              </SortableProductTile>
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeProduct && (
            <div style={{ transform: 'scale(1.05)', opacity: 0.85 }}>
              {renderTile(activeProduct)}
            </div>
          )}
        </DragOverlay>
        {hasMore && (
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', padding: '8px 0 16px' }}>
            Showing first {MAX_ITEMS} of {products.length} — search to find more
          </p>
        )}
      </DndContext>
    )
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, padding: 10 }}>
        {capped.map(p => renderTile(p))}
      </div>
      {hasMore && (
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', padding: '8px 0 16px' }}>
          Showing first {MAX_ITEMS} of {products.length} — search to find more
        </p>
      )}
    </>
  )
})
