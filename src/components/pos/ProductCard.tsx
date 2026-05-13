'use client'
import { useState } from 'react'

interface Product {
  id: string
  name: string
  price: number
  image_url?: string | null
  category?: string | null
  stock_quantity?: number | null
  is_active?: boolean
}

interface Props {
  product: Product
  onAdd: (product: Product) => void
  quantity?: number
}

const CATEGORY_EMOJI: Record<string, string> = {
  'coffee':     '☕',
  'tea':        '🍵',
  'hot drinks': '🫖',
  'cold drinks':'🥤',
  'mixer':      '🥤',
  'food':       '🍽️',
  'breakfast':  '🍳',
  'lunch':      '🥗',
  'bakery':     '🥐',
  'extras':     '➕',
  'kids':       '🧃',
  'default':    '🍽️',
}

export default function ProductCard({ product, onAdd, quantity = 0 }: Props) {
  const [imgError, setImgError] = useState(false)
  const key = (product.category ?? 'default').toLowerCase()
  const emoji = CATEGORY_EMOJI[key] ?? CATEGORY_EMOJI.default
  const isOutOfStock = product.stock_quantity === 0

  return (
    <button
      onClick={() => !isOutOfStock && onAdd(product)}
      disabled={isOutOfStock}
      style={{
        position: 'relative',
        background: '#1a1a24',
        border: quantity > 0
          ? '2px solid #2D5240'
          : '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        overflow: 'hidden',
        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'left',
        padding: 0,
        transition: 'transform 0.1s, border-color 0.15s',
        opacity: isOutOfStock ? 0.5 : 1,
        fontFamily: 'inherit',
        width: '100%',
      }}
      onMouseDown={e => {
        if (!isOutOfStock)
          (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'
      }}
      onMouseUp={e => {
        (e.currentTarget as HTMLElement).style.transform = 'scale(1)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = 'scale(1)'
      }}
    >
      {/* Quantity badge */}
      {quantity > 0 && (
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 2,
          width: 22, height: 22, borderRadius: '50%',
          background: '#2D5240',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: 11, fontWeight: 700,
        }}>
          {quantity}
        </div>
      )}

      {/* Out of stock overlay */}
      {isOutOfStock && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)',
        }}>
          <span style={{
            background: 'rgba(0,0,0,0.8)',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 11, fontWeight: 600,
            padding: '4px 10px', borderRadius: 20,
          }}>Out of Stock</span>
        </div>
      )}

      {/* Product image — 4:3 aspect ratio */}
      <div style={{
        width: '100%',
        paddingTop: '75%',
        position: 'relative',
        background: 'linear-gradient(135deg, rgba(45,82,64,0.08), rgba(127,184,151,0.04))',
        overflow: 'hidden',
      }}>
        {product.image_url && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.name}
            onError={() => setImgError(true)}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'contain',
              padding: 10,
            }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40,
            background: 'linear-gradient(135deg, rgba(45,82,64,0.3), rgba(127,184,151,0.1))',
          }}>
            {emoji}
          </div>
        )}
      </div>

      {/* Product info */}
      <div style={{ padding: '10px 12px 12px' }}>
        <p style={{
          color: 'white', fontSize: 13, fontWeight: 500,
          margin: '0 0 4px', lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
        }}>
          {product.name}
        </p>
        <p style={{ color: '#7FB897', fontSize: 14, fontWeight: 700, margin: 0, fontStyle: 'italic', fontFamily: "'Instrument Serif', Georgia, serif" }}>
          A${product.price.toFixed(2)}
        </p>
      </div>
    </button>
  )
}