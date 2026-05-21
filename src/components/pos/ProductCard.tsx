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
  fromPrice?: number  // when set, shows "from $X" instead of fixed price
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

export default function ProductCard({ product, onAdd, quantity = 0, fromPrice }: Props) {
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
          width: 26, height: 26, borderRadius: '50%',
          background: '#2D5240',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: 12, fontWeight: 700,
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
        paddingTop: '52%',
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
      <div style={{ padding: '12px 14px 14px' }}>
        <p style={{
          color: 'white', fontSize: 15, fontWeight: 600,
          margin: '0 0 4px', lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
        }}>
          {product.name}
        </p>
        {product.price === 0 ? (
          <p style={{ color: 'rgba(127,184,151,0.35)', fontSize: 11, fontWeight: 500, margin: 0,
            background: 'rgba(0,0,0,0.25)', borderRadius: 4, padding: '2px 6px', display: 'inline-block' }}>
            No price set
          </p>
        ) : (
          <p style={{ color: '#7FB897', fontSize: 16, fontWeight: 700, margin: 0,
            fontFamily: "'Inter','Manrope',system-ui,sans-serif", fontStyle: 'normal' }}>
            {fromPrice != null && fromPrice < product.price
              ? <>from A${fromPrice.toFixed(2)}</>
              : <>A${product.price.toFixed(2)}</>}
          </p>
        )}
      </div>
    </button>
  )
}