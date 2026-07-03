'use client'
// DEV ONLY — 3D filled-drink viewer (COFFEE-3D-FILLED). Remove or gate before launch.
import { useState } from 'react'
import { CoffeeViewer } from '@/components/order/CoffeeViewer'
import { resolveCoffeeSlug, DRINK_LABELS, type DrinkType } from '@/lib/drinkFills'

const ALL_DRINKS = Object.keys(DRINK_LABELS) as DrinkType[]

const SANS = "'Inter', system-ui, sans-serif"
const MONO = "'JetBrains Mono', 'Fira Code', monospace"
const LIME = '#d9f54e'
const INK  = '#0a0a0a'
const MUTED = '#6b7280'
const BORDER = '#e5e7eb'

type SizeLabel = 'Regular' | 'Large'
const SIZE_SCALE: Record<SizeLabel, number> = { Regular: 0.9, Large: 1.0 }

export default function Coffee3dPreviewPage() {
  const [drink, setDrink] = useState<DrinkType>('flat-white')
  const [sizeLabel, setSizeLabel] = useState<SizeLabel>('Regular')

  const slug = resolveCoffeeSlug(drink)
  const sizeScale = SIZE_SCALE[sizeLabel]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fafafa',
        fontFamily: SANS,
        padding: '40px 24px 80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 40,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
          DEV PREVIEW — COFFEE-3D-FILLED
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>
          Filled-Drink GLB Viewer
        </h1>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 520 }}>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
            Drink type
          </label>
          <select
            value={drink}
            onChange={e => setDrink(e.target.value as DrinkType)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 10,
              border: '1.5px solid ' + BORDER,
              background: '#ffffff',
              fontSize: 15,
              fontWeight: 600,
              color: INK,
              fontFamily: SANS,
              cursor: 'pointer',
              appearance: 'none',
            }}
          >
            {ALL_DRINKS.map(d => (
              <option key={d} value={d}>{DRINK_LABELS[d]}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
            Size
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['Regular', 'Large'] as SizeLabel[]).map(s => {
              const on = sizeLabel === s
              return (
                <button
                  key={s}
                  onClick={() => setSizeLabel(s)}
                  style={{
                    flex: 1,
                    padding: '9px 0',
                    borderRadius: 10,
                    border: '2px solid ' + (on ? INK : BORDER),
                    background: on ? INK : '#ffffff',
                    color: on ? '#ffffff' : INK,
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: SANS,
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── 3D Viewer ────────────────────────────────────────────────────── */}
      {slug ? (
        <CoffeeViewer key={slug} slug={slug} sizeScale={sizeScale} size={320} />
      ) : (
        <div
          style={{
            width: 320,
            height: 320,
            borderRadius: 24,
            background: '#f3f4f6',
            border: '2px dashed ' + BORDER,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 32 }}>📷</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>No GLB scan yet</div>
          <div style={{ fontSize: 11, color: MUTED }}>Hero image fallback</div>
        </div>
      )}

      {/* ── Debug readout ────────────────────────────────────────────────── */}
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#111',
          borderRadius: 12,
          padding: '16px 18px',
          fontFamily: MONO,
          fontSize: 12,
          color: LIME,
          lineHeight: 1.8,
        }}
      >
        <div>drink: {drink}</div>
        <div>slug: {slug ?? 'null (no scan — hero image fallback)'}</div>
        <div>sizeScale: {sizeScale} ({sizeLabel})</div>
        <div>glb path: {slug ? '/menu/_lib/models/coffee/' + slug + '.glb' : '—'}</div>
        <div style={{ marginTop: 8, color: '#888' }}>
          Available GLBs: flat-white.glb (225 KB draco+webp, Y-up confirmed)
        </div>
        <div style={{ color: '#888' }}>
          Hot drink fallback → flat-white | Iced/smoothie → hero image
        </div>
      </div>

      {/* ── Asset status ─────────────────────────────────────────────────── */}
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
          Coffee GLB assets
        </div>
        {[
          { path: '/menu/_lib/models/coffee/flat-white.glb', status: 'present' },
          { path: '/menu/_lib/models/coffee/latte.glb', status: 'awaiting scan' },
          { path: '/menu/_lib/models/coffee/iced-latte.glb', status: 'awaiting scan' },
          { path: '/menu/_lib/models/coffee/smoothie-berry.glb', status: 'awaiting scan' },
        ].map(({ path, status }) => (
          <div
            key={path}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              fontFamily: MONO,
              color: status === 'present' ? '#22c55e' : '#f59e0b',
              padding: '4px 0',
              borderBottom: '1px solid ' + BORDER,
            }}
          >
            <span style={{ color: MUTED }}>{path}</span>
            <span>{status === 'present' ? '✓' : '○ ' + status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}