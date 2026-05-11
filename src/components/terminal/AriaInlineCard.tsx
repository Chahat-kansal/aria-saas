'use client'
import { useMemo } from 'react'

interface CartItem {
  name: string
  category?: string | null
}

interface Props {
  cartItems: CartItem[]
  customer?: { name: string; visits?: number } | null
  onAddSuggestion?: (productName: string) => void
}

interface Suggestion {
  text: string
  productName: string
  price: number
  productId: string
  color: [string, string]
}

function pickSuggestion(items: CartItem[], customer: Props['customer']): Suggestion | null {
  if (items.length === 0) return null
  const cats = new Set(items.map(i => i.category?.toLowerCase() ?? ''))

  if (cats.has('whisky') || cats.has('spirits') || cats.has('bourbon')) {
    return {
      text: customer
        ? `${customer.name.split(' ')[0]} often grabs a mixer with spirits.`
        : 'Soda water pairs well with whisky — high attach rate.',
      productName: 'Schweppes Soda 1L', price: 4.99, productId: 'sug-soda',
      color: ['#1a3a6a', '#3a6abc'],
    }
  }
  if (cats.has('wine') || cats.has('wine-red') || cats.has('wine-white')) {
    return {
      text: 'Cheese platter pairs nicely — high margin add-on.',
      productName: 'Brie & Crackers Platter', price: 18.50, productId: 'sug-cheese',
      color: ['#8a6a3a', '#C8A464'],
    }
  }
  if (cats.has('beer') || cats.has('beer & cider')) {
    return {
      text: 'Upsell to a slab — 24-pack costs 18% less per unit.',
      productName: 'Same brand · Slab (24)', price: 58.99, productId: 'sug-slab',
      color: ['#3a2615', '#A8662F'],
    }
  }
  return null
}

export function AriaInlineCard({ cartItems, customer, onAddSuggestion }: Props) {
  const suggestion = useMemo(() => pickSuggestion(cartItems, customer), [cartItems, customer])
  if (!suggestion) return null

  return (
    <div className="aria-insight">
      <div className="aria-insight-header">
        <div className="aria-insight-mark">A</div>
        <span className="aria-insight-label">Aria · suggestion</span>
      </div>
      <div className="aria-insight-text">"{suggestion.text}"</div>
      <div className="aria-insight-action">
        <div className="aria-insight-suggest">
          <svg viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" style={{ width: 16, height: 20, flexShrink: 0 }}>
            <defs>
              <linearGradient id={`sug-${suggestion.productId}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor={suggestion.color[0]} />
                <stop offset="50%"  stopColor={suggestion.color[1]} />
                <stop offset="100%" stopColor={suggestion.color[0]} />
              </linearGradient>
            </defs>
            <rect x="16" y="14" width="28" height="78" rx="2"
              fill={`url(#sug-${suggestion.productId})`} />
          </svg>
          <span>{suggestion.productName}</span>
          <span className="price">${suggestion.price.toFixed(2)}</span>
        </div>
        <button className="aria-insight-quick"
          onClick={() => onAddSuggestion?.(suggestion.productName)}>
          + Add
        </button>
      </div>
    </div>
  )
}
