'use client'
import { useState } from 'react'
import { BottleViewer } from '@/components/order/BottleViewer'
import type { BottleSlug } from '@/lib/bottleSlug'

const ROWS: { slug: BottleSlug; name: string; glb: string; archetype: string }[] = [
  { slug: 'wine',      name: 'Shiraz',        glb: 'wine.glb',      archetype: 'wine / red-wine / white-wine / champagne' },
  { slug: 'beer',      name: 'Pale Ale',       glb: 'beer.glb',      archetype: 'beer / lager / ale / stout / cider' },
  { slug: 'can',       name: 'Vodka Soda',     glb: 'can.glb',       archetype: 'can / rtd / seltzer / pre-mix' },
  { slug: 'spirits-a', name: 'Single Malt',    glb: 'spirits-a.glb', archetype: 'spirits-a / whiskey / gin / vodka / bourbon' },
  { slug: 'spirits-b', name: 'Amaretto',       glb: 'spirits-b.glb', archetype: 'spirits-b / liqueur / sake / aperitif' },
]

export default function Bottle3dDevPage() {
  const [selected, setSelected] = useState<BottleSlug>('wine')
  const [customLabel, setCustomLabel] = useState('')
  const [labelUrl, setLabelUrl] = useState('')

  const row = ROWS.find(r => r.slug === selected) ?? ROWS[0]
  const label = customLabel || row.name

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fafafa',
        padding: 32,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0a0a0a', margin: '0 0 4px' }}>
        /dev/bottle-3d
      </h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 32px' }}>
        ORD-3D-BOTTLE — 5 GLBs, 360° drag, auto-normalised height, texture clamp fix
      </p>

      <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 280 }}>
          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                display: 'block',
                marginBottom: 6,
              }}
            >
              Bottle type
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ROWS.map(r => (
                <button
                  key={r.slug}
                  onClick={() => setSelected(r.slug)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1.5px solid ' + (selected === r.slug ? '#0a0a0a' : '#e5e7eb'),
                    background: selected === r.slug ? '#0a0a0a' : '#fff',
                    color: selected === r.slug ? '#fff' : '#0a0a0a',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {r.slug}
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      fontWeight: 400,
                      color: selected === r.slug ? '#9ca3af' : '#9ca3af',
                    }}
                  >
                    {r.glb}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                display: 'block',
                marginBottom: 6,
              }}
            >
              Custom label text
            </label>
            <input
              type="text"
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              placeholder={row.name}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 10,
                border: '1.5px solid #e5e7eb',
                fontSize: 14,
                color: '#0a0a0a',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                display: 'block',
                marginBottom: 6,
              }}
            >
              Label image URL (uploaded art)
            </label>
            <input
              type="text"
              value={labelUrl}
              onChange={e => setLabelUrl(e.target.value)}
              placeholder="https://…"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 10,
                border: '1.5px solid #e5e7eb',
                fontSize: 13,
                color: '#0a0a0a',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Debug */}
          <div style={{ background: '#f3f4f6', borderRadius: 12, padding: 14 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 8,
              }}
            >
              Debug
            </div>
            {[
              ['slug',   row.slug],
              ['glb',    '/menu/_lib/models/' + row.glb],
              ['label',  label || '(none)'],
              ['archetype aliases', row.archetype],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: '#374151',
                  marginBottom: 4,
                  gap: 8,
                }}
              >
                <span style={{ color: '#9ca3af', flexShrink: 0 }}>{k}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 10, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Viewer */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <BottleViewer
            key={selected}
            slug={selected}
            label={labelUrl ? undefined : label}
            labelUrl={labelUrl || undefined}
            size={320}
          />
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
            {row.slug} · {row.glb} · drag to spin
          </p>
        </div>

        {/* All 5 at once (orientation check) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            All 5 — upright check
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {ROWS.map(r => (
              <div key={r.slug} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <BottleViewer slug={r.slug} label={r.name} size={140} />
                <span style={{ fontSize: 11, color: '#6b7280' }}>{r.slug}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}