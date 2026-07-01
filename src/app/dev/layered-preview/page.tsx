'use client'
// DEV ONLY — remove or gate before launch
import { useState } from 'react'
import { LayeredProduct } from '@/components/order/LayeredProduct'
import { ProductCustomiser } from '@/components/order/ProductCustomiser'
import { ProductView } from '@/components/order/ProductView'
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
        padding: '40px 20px 200px',
        gap: 48,
      }}
    >
      {/* ── Section 1: original toggle demo ─────────────────────────── */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          width: '100%',
          maxWidth: 520,
        }}
      >
        <h2
          style={{
            fontFamily: 'sans-serif',
            fontSize: 15,
            fontWeight: 600,
            color: '#555',
            margin: 0,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
          }}
        >
          LayeredProduct — toggle demo
        </h2>

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
          {'[' + layers.join(', ') + ']'}
        </p>
      </section>

      {/* ── Divider ────────────────────────────────────────────────── */}
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          height: 1,
          background: 'linear-gradient(90deg, transparent, #e5e7eb, transparent)',
        }}
      />

      {/* ── Section 2: drag-to-build customiser ────────────────────── */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          maxWidth: 520,
        }}
      >
        <h2
          style={{
            fontFamily: 'sans-serif',
            fontSize: 15,
            fontWeight: 600,
            color: '#555',
            margin: 0,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
          }}
        >
          ProductCustomiser — drag or tap to build
        </h2>

        <ProductCustomiser size={220} />
      </section>

      {/* ── Divider ────────────────────────────────────────────────── */}
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          height: 1,
          background: 'linear-gradient(90deg, transparent, #e5e7eb, transparent)',
        }}
      />

      {/* ── Section 3: standard hero + spin-video hero via ProductView ── */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 32,
          width: '100%',
          maxWidth: 520,
        }}
      >
        <h2
          style={{
            fontFamily: 'sans-serif',
            fontSize: 15,
            fontWeight: 600,
            color: '#555',
            margin: 0,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
          }}
        >
          ProductView — standard hero + spin-video
        </h2>

        {/* Standard hero row */}
        <div
          style={{
            display: 'flex',
            gap: 32,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {/* Flat white — image hero, resolveRenderMode → 'standard' */}
          <ProductView
            product={{ ordering_mode: 'inherit' }}
            imageSrc="/menu/sip-ff5055/flat-white.png"
            name="Flat White"
            size={200}
          />

          {/* Croissant — image hero, resolveRenderMode → 'standard' */}
          <ProductView
            product={{ ordering_mode: 'inherit' }}
            imageSrc="/menu/sip-ff5055/croissant.png"
            name="Croissant"
            size={200}
          />
        </div>

        {/* Spin-video hero — signature-stack.mp4 autoplays as hero clip */}
        <ProductView
          product={{ ordering_mode: 'inherit' }}
          imageSrc="/menu/sip-ff5055/flat-white.png"
          videoSrc="/menu/sip-ff5055/signature-stack.mp4"
          name="Signature Stack (spin)"
          size={240}
        />

        {/* Build mode switch demo — ordering_mode='build' → ProductCustomiser */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            width: '100%',
          }}
        >
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#999',
              margin: 0,
            }}
          >
            ordering_mode=&apos;build&apos; → ProductCustomiser ↓
          </p>
          <ProductView
            product={{ ordering_mode: 'build' }}
            name="Beef Burger"
            size={180}
          />
        </div>
      </section>
    </div>
  )
}