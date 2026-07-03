'use client'
// DEV ONLY — 3D vessel + liquid fill preview. Remove or gate before launch.
import { useState } from 'react'
import { ArchetypeViewer } from '@/components/order/ArchetypeViewer'
import {
  resolveVessel,
  DRINK_LABELS,
  type DrinkType,
  type OrderType,
  type ModifierFlags,
} from '@/lib/drinkFills'

const ALL_DRINKS = Object.keys(DRINK_LABELS) as DrinkType[]

const SANS = "'Inter', system-ui, sans-serif"
const MONO = "'JetBrains Mono', 'Fira Code', monospace"
const LIME = '#d9f54e'
const INK  = '#0a0a0a'
const MUTED = '#6b7280'
const BORDER = '#e5e7eb'

export default function Coffee3dPreviewPage() {
  const [drink, setDrink] = useState<DrinkType>('flat-white')
  const [orderType, setOrderType] = useState<OrderType>('dine-in')
  const [mods, setMods] = useState<ModifierFlags>({})

  const resolved = resolveVessel(drink, orderType, mods)

  function toggleMod(key: keyof ModifierFlags) {
    setMods(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const MOD_LABELS: Array<{ key: keyof ModifierFlags; label: string }> = [
    { key: 'milk',          label: 'Milk' },
    { key: 'extraMilk',     label: 'Extra Milk' },
    { key: 'caramelSyrup',  label: 'Caramel Syrup' },
    { key: 'vanillaSyrup',  label: 'Vanilla Syrup' },
    { key: 'hazelnutSyrup', label: 'Hazelnut Syrup' },
  ]

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
          DEV PREVIEW — ORD-3D-COFFEE
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>
          Vessel + Liquid Fill
        </h1>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 520 }}>

        {/* Drink selector */}
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

        {/* Order type toggle */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
            Order type
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['dine-in', 'takeaway'] as OrderType[]).map(t => {
              const on = orderType === t
              return (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
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
                    textTransform: 'capitalize',
                  }}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>

        {/* Modifier chips */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
            Modifiers
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {MOD_LABELS.map(({ key, label }) => {
              const on = !!mods[key]
              return (
                <button
                  key={key}
                  onClick={() => toggleMod(key)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 20,
                    border: '2px solid ' + (on ? LIME : BORDER),
                    background: on ? LIME : '#ffffff',
                    color: INK,
                    fontSize: 13,
                    fontWeight: on ? 700 : 500,
                    fontFamily: SANS,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── 3D Viewer ────────────────────────────────────────────────────── */}
      <ArchetypeViewer
        key={resolved.vesselKey + resolved.sourceType}
        modelPath={resolved.modelPath}
        sourceType={resolved.sourceType}
        vesselKey={resolved.vesselKey}
        fillColor={resolved.fillColor}
        fillLevel={resolved.fillLevel}
        foam={resolved.foam}
        ice={resolved.ice}
        size={320}
        isTransparent={resolved.isTransparent}
        clipsEnabled={resolved.vesselFamily === 'iced'}
        clipPath="/menu/_lib/clips/caramel-pour.webm"
        clipPathMov="/menu/_lib/clips/caramel-pour.mov"
      />

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
          lineHeight: 1.7,
        }}
      >
        <div>drink: {drink}</div>
        <div>orderType: {orderType}</div>
        <div>sourceType: {resolved.sourceType} — vesselKey: {resolved.vesselKey}</div>
        <div>fillColor: {resolved.fillColor}</div>
        <div>fillLevel: {resolved.fillLevel}</div>
        <div>foam: {String(resolved.foam)}</div>
        <div>ice: {String(resolved.ice)}</div>
        <div style={{ marginTop: 8, color: '#888' }}>
          smoothie vessel: smoothie.glb (325 KB draco+webp, Y-up confirmed)
        </div>
        <div style={{ color: '#888' }}>
          vessel family: {resolved.vesselFamily}
        </div>
        <div style={{ color: '#888' }}>
          isTransparent: {String(resolved.isTransparent)} — fill mode: {resolved.isTransparent ? 'column (glass)' : 'disc (opaque cup)'}
        </div>
        <div style={{ color: resolved.vesselFamily === 'iced' ? '#d9f54e' : '#888' }}>
          clips: {resolved.vesselFamily === 'iced' ? 'ENABLED — iced family (toggle syrup to test)' : 'off — hot/smoothie vessels (no clip until hot-cup asset exists)'}
        </div>
      </div>

      {/* ── Asset status ─────────────────────────────────────────────────── */}
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
          Asset status
        </div>
        {[
          { path: '/menu/_lib/models/cup-hot-dinein.glb',    status: 'present' },
          { path: '/menu/_lib/models/cup-hot-takeaway.glb',  status: 'present' },
          { path: '/menu/_lib/models/cup-iced-takeaway.glb', status: 'present' },
          { path: '/menu/_lib/models/glass-iced-dinein.glb', status: 'present' },
          { path: '/menu/_lib/models/smoothie.glb',          status: 'present' },
          { path: '/menu/_lib/clips/caramel-pour.webm',     status: 'MISSING — drop VP9-alpha webm here' },
          { path: '/menu/_lib/clips/caramel-pour.mov',      status: 'MISSING — drop HEVC-alpha mov here' },
        ].map(({ path, status }) => (
          <div
            key={path}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              fontFamily: MONO,
              color: status === 'present' ? '#22c55e' : '#ef4444',
              padding: '4px 0',
              borderBottom: '1px solid ' + BORDER,
            }}
          >
            <span style={{ color: MUTED }}>{path}</span>
            <span>{status === 'present' ? '✓' : '✗ ' + status.replace('present', '')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}