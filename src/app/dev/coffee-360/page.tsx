'use client'
import { useState } from 'react'
import { Spin360Viewer } from '@/components/order/Spin360Viewer'
import { resolveCoffeeSpin, resolveCoffeeBgMode } from '@/lib/drinkFills'

// All 29 archetypes + their display names grouped by spin slug
const DRINK_ROWS: { archetype: string; label: string; spin: string }[] = [
  { archetype: 'flat-white',     label: 'Flat White',       spin: 'flat-white' },
  { archetype: 'latte',          label: 'Latte',            spin: 'flat-white' },
  { archetype: 'cappuccino',     label: 'Cappuccino',       spin: 'flat-white' },
  { archetype: 'mocha',          label: 'Mocha',            spin: 'flat-white' },
  { archetype: 'chai',           label: 'Chai Latte',       spin: 'flat-white' },
  { archetype: 'dirty-chai',     label: 'Dirty Chai',       spin: 'flat-white' },
  { archetype: 'matcha',         label: 'Matcha Latte',     spin: 'flat-white' },
  { archetype: 'turmeric-latte', label: 'Turmeric Latte',   spin: 'flat-white' },
  { archetype: 'macchiato',      label: 'Macchiato',        spin: 'flat-white' },
  { archetype: 'long-macchiato', label: 'Long Macchiato',   spin: 'flat-white' },
  { archetype: 'espresso',       label: 'Espresso',         spin: 'espresso'   },
  { archetype: 'iced-latte',     label: 'Iced Latte',       spin: 'iced-latte' },
  { archetype: 'iced-mocha',     label: 'Iced Mocha',       spin: 'iced-latte' },
  { archetype: 'iced-choc',      label: 'Iced Chocolate',   spin: 'iced-latte' },
  { archetype: 'hot-choc',       label: 'Hot Chocolate',    spin: 'hot-choc' },
  { archetype: 'chai-tea',       label: 'Chai Tea',         spin: 'chai-tea'   },
  { archetype: 'cold-brew',      label: 'Cold Brew',        spin: 'cold-brew'  },
  { archetype: 'choc-milkshake',    label: 'Chocolate Milkshake', spin: 'milkshake' },
  { archetype: 'caramel-milkshake', label: 'Caramel Milkshake',   spin: 'milkshake' },
  { archetype: 'vanilla-milkshake', label: 'Vanilla Milkshake',   spin: 'milkshake' },
  { archetype: 'acai',           label: 'Acai Smoothie',    spin: 'smoothie'   },
  { archetype: 'avocado',        label: 'Avocado Smoothie', spin: 'smoothie'   },
  { archetype: 'banana',         label: 'Banana Smoothie',  spin: 'smoothie'   },
  { archetype: 'berry',          label: 'Berry Smoothie',   spin: 'smoothie'   },
  { archetype: 'choc-smoothie',  label: 'Chocolate Smoothie', spin: 'smoothie' },
  { archetype: 'green-smoothie', label: 'Green Smoothie',   spin: 'smoothie'   },
  { archetype: 'mango-smoothie', label: 'Mango Smoothie',   spin: 'smoothie'   },
  { archetype: 'juice-apple',    label: 'Apple Juice',      spin: 'juice'      },
  { archetype: 'juice-orange',   label: 'Orange Juice',     spin: 'juice'      },
]

export default function Coffee360DevPage() {
  const [selected, setSelected] = useState(DRINK_ROWS[0].archetype)
  const [sizeScale, setSizeScale] = useState(1.0)

  const row = DRINK_ROWS.find(r => r.archetype === selected) ?? DRINK_ROWS[0]
  const spinSlug = resolveCoffeeSpin(selected)

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', padding: 32, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0a0a0a', margin: '0 0 4px' }}>
        /dev/coffee-360
      </h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 32px' }}>
        COFFEE-SPIN-FINAL — 29 drinks, 9 spin slugs (3 opaque #fafafa · 6 grey #c8c8c4)
      </p>

      <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 260 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
              Drink archetype
            </label>
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, background: '#fff', color: '#0a0a0a', cursor: 'pointer' }}
            >
              {DRINK_ROWS.map(r => (
                <option key={r.archetype} value={r.archetype}>
                  {r.label} [{r.archetype}]
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
              Size
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['Regular', 0.9], ['Large', 1.0]] as const).map(([label, scale]) => (
                <button
                  key={label}
                  onClick={() => setSizeScale(scale)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 10,
                    border: '1.5px solid ' + (sizeScale === scale ? '#0a0a0a' : '#e5e7eb'),
                    background: sizeScale === scale ? '#0a0a0a' : '#fff',
                    color: sizeScale === scale ? '#fff' : '#0a0a0a',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Debug panel */}
          <div style={{ background: '#f3f4f6', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Debug
            </div>
            {[
              ['archetype', selected],
              ['spin slug', spinSlug ?? '(none)'],
              ['frames path', spinSlug ? '/menu/_lib/spin/' + spinSlug + '/000–023.webp' : 'fallback → hero image'],
              ['sizeScale', String(sizeScale)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#374151', marginBottom: 4 }}>
                <span style={{ color: '#9ca3af' }}>{k}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Viewer */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {spinSlug ? (
            <Spin360Viewer key={spinSlug + sizeScale} slug={spinSlug} bgMode={resolveCoffeeBgMode(spinSlug)} sizeScale={sizeScale} size={320} />
          ) : (
            <div style={{ width: 320, height: 320, borderRadius: 24, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 48 }}>🖼️</span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>No spin — hero image</span>
            </div>
          )}
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {row.label} · {spinSlug ? 'spin: ' + spinSlug : 'hero fallback'}
          </div>
        </div>
      </div>

      {/* All 29 drinks table */}
      <div style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0a0a0a', marginBottom: 16 }}>
          All 29 drinks × spin assignment
        </h2>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', maxWidth: 640 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '6px 12px', color: '#6b7280', fontWeight: 600 }}>Drink</th>
              <th style={{ textAlign: 'left', padding: '6px 12px', color: '#6b7280', fontWeight: 600 }}>archetype</th>
              <th style={{ textAlign: 'left', padding: '6px 12px', color: '#6b7280', fontWeight: 600 }}>spin slug</th>
            </tr>
          </thead>
          <tbody>
            {DRINK_ROWS.map((r, i) => (
              <tr
                key={r.archetype}
                onClick={() => setSelected(r.archetype)}
                style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: selected === r.archetype ? '#fef9c3' : i % 2 === 0 ? '#fff' : '#fafafa' }}
              >
                <td style={{ padding: '6px 12px', fontWeight: 500 }}>{r.label}</td>
                <td style={{ padding: '6px 12px', fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>{r.archetype}</td>
                <td style={{ padding: '6px 12px', fontFamily: 'monospace', fontSize: 11, color: r.spin.startsWith('(') ? '#ef4444' : '#16a34a' }}>{r.spin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}