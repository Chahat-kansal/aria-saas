'use client'
// DEV ONLY — remove or gate before launch
import { useState } from 'react'
import { LayeredProduct } from '@/components/order/LayeredProduct'
import { composeBurger, type IngredientKey } from '@/components/order/ingredients'

const TOPPINGS: IngredientKey[] = [
  'cheese', 'bacon', 'tomato', 'lettuce', 'onion', 'pickle', 'sauce',
]

export default function LayeredPreviewPage() {
  const [active, setActive] = useState<Set<IngredientKey>>(new Set())

  function toggle(key: IngredientKey) {
    setActive(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const layers = composeBurger([...active])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fafafa',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 20px',
        gap: 32,
      }}
    >
      <h1
        style={{
          fontFamily: 'sans-serif',
          fontSize: 18,
          fontWeight: 600,
          color: '#111',
          margin: 0,
          letterSpacing: '-0.01em',
        }}
      >
        LayeredProduct — dev preview
      </h1>

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 480,
        }}
      >
        {TOPPINGS.map(t => {
          const on = active.has(t)
          return (
            <button
              key={t}
              onClick={() => toggle(t)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: '2px solid ' + (on ? '#84cc16' : '#d1d5db'),
                background: on ? '#84cc16' : '#ffffff',
                color: on ? '#ffffff' : '#374151',
                fontFamily: 'monospace',
                fontSize: 13,
                fontWeight: on ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t}
            </button>
          )
        })}
      </div>

      <LayeredProduct layers={layers} />

      <p
        style={{
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#999',
          margin: 0,
          textAlign: 'center',
          maxWidth: 400,
        }}
      >
        [{layers.join(', ')}]
      </p>
    </div>
  )
}