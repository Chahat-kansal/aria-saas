'use client'

import { useState } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

const GLASS_BG = 'rgba(255,255,255,0.65)'
const GLASS_BORDER = '1px solid rgba(0,0,0,0.05)'
const GLASS_SHADOW = '0 2px 12px rgba(0,0,0,0.06)'
const GLASS_BLUR = 'blur(12px)'

type Outlet = {
  id: string
  name: string | null
  address: string | null
  phone: string | null
  is_default: boolean | null
  is_active: boolean | null
  opening_hours: unknown
  lat: number | null
  lng: number | null
}

// Prefer a lat/lng deep link (no embed API key needed) over a text query —
// more accurate, and works even when the free-text address is ambiguous.
function mapsUrlFor(outlet: Outlet): string | null {
  if (outlet.lat != null && outlet.lng != null) {
    return 'https://www.google.com/maps/search/?api=1&query=' + outlet.lat + ',' + outlet.lng
  }
  if (outlet.address) return 'https://maps.google.com/?q=' + encodeURIComponent(outlet.address)
  return null
}

type Hours = { [day: string]: { open: string; close: string; closed?: boolean } }

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function todayKey() {
  const d = new Date().getDay()
  return DAYS[d === 0 ? 6 : d - 1]
}

function formatHours(opening_hours: unknown): string {
  if (!opening_hours || typeof opening_hours !== 'object') return 'Hours unavailable'
  const hours = opening_hours as Hours
  const today = todayKey()
  const slot = hours[today]
  if (!slot || slot.closed) return 'Closed today'
  return 'Today ' + slot.open + ' – ' + slot.close
}

function staticMapUrlFor(outlet: Outlet): string | null {
  if (outlet.lat == null || outlet.lng == null) return null
  return '/api/geoapify/staticmap?lat=' + outlet.lat + '&lng=' + outlet.lng
}

// Fails soft: the geoapify route 503s when GEOAPIFY_API_KEY is unset (dev/preview,
// or before the founder configures it) — hide the thumbnail entirely on load failure
// rather than showing a browser broken-image icon on the public locations page.
function OutletMapThumb({ outlet }: { outlet: Outlet }) {
  const [failed, setFailed] = useState(false)
  const src = staticMapUrlFor(outlet)
  if (!src || failed) return null
  return (
    <a
      href={mapsUrlFor(outlet) ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'block', margin: '-18px -20px 12px' }}
    >
      <img
        src={src}
        alt={outlet.address ?? outlet.name ?? 'Map'}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
      />
    </a>
  )
}

function HoursTooltip({ opening_hours }: { opening_hours: unknown }) {
  if (!opening_hours || typeof opening_hours !== 'object') return null
  const hours = opening_hours as Hours
  return (
    <div style={{ marginTop: 10 }}>
      {DAYS.map((d, i) => {
        const slot = hours[d]
        return (
          <div key={d} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FB, fontSize: 12, color: INK_MUTED, marginBottom: 2 }}>
            <span style={{ fontWeight: todayKey() === d ? 700 : 400, color: todayKey() === d ? INK : INK_MUTED }}>
              {SHORT[i]}
            </span>
            <span>
              {slot?.closed ? 'Closed' : slot ? (slot.open + ' – ' + slot.close) : 'Closed'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function LocationsClient({ slug, bizName, outlets }: {
  slug: string
  bizId: string
  bizName: string
  outlets: Outlet[]
}) {
  const [activeId, setActiveId] = useState<string | null>(
    outlets.find(o => o.is_default)?.id ?? outlets[0]?.id ?? null
  )
  const [expanded, setExpanded] = useState<string | null>(null)

  const handleSetActive = (id: string) => {
    setActiveId(id)
    try { localStorage.setItem('aria_cx_outlet_' + slug, id) } catch { /* ok */ }
  }

  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FB, color: INK, paddingBottom: 'calc(96px + env(safe-area-inset-bottom))', maxWidth: '28rem', margin: '0 auto' }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>
      {/* Header */}
      <div style={{ padding: '52px 20px 20px' }}>
        <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 30, margin: '0 0 4px' }}>
          {bizName}
        </h1>
        <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>
          {outlets.length + ' location' + (outlets.length !== 1 ? 's' : '')}
        </p>
      </div>

      {/* Outlet cards */}
      <div style={{ padding: '0 16px' }}>
        {outlets.length === 0 && (
          <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, padding: '40px 0', textAlign: 'center' }}>
            No locations found.
          </p>
        )}
        {outlets.map(outlet => {
          const isActive = outlet.id === activeId
          const isExpanded = outlet.id === expanded
          const hoursLabel = formatHours(outlet.opening_hours)
          return (
            <div
              key={outlet.id}
              style={{
                background: GLASS_BG,
                backdropFilter: GLASS_BLUR,
                WebkitBackdropFilter: GLASS_BLUR,
                borderRadius: 20, marginBottom: 12,
                border: isActive ? ('2px solid ' + ACCENT) : GLASS_BORDER,
                boxShadow: isActive ? ('0 0 0 1px ' + ACCENT + ', 0 4px 20px rgba(0,0,0,0.06)') : GLASS_SHADOW,
                padding: '18px 20px',
                overflow: 'hidden',
                transition: 'border 0.15s',
              }}
            >
              <OutletMapThumb outlet={outlet} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: FB, fontSize: 16, fontWeight: 700, color: INK }}>
                      {outlet.name ?? 'Location'}
                    </span>
                    {outlet.is_default && (
                      <span style={{
                        background: ACCENT, color: ACCENT_TEXT, fontSize: 10, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 999, fontFamily: FB, textTransform: 'uppercase',
                      }}>
                        Main
                      </span>
                    )}
                  </div>
                  {outlet.address && (
                    <>
                      <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '0 0 4px', lineHeight: 1.4 }}>
                        {outlet.address}
                      </p>
                      {mapsUrlFor(outlet) && (
                        <a
                          href={mapsUrlFor(outlet)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'inline-block', fontFamily: FB, fontSize: 12, color: ACCENT_TEXT, fontWeight: 700, textDecoration: 'none', marginBottom: 6 }}
                        >
                          Open in Maps ↗
                        </a>
                      )}
                    </>
                  )}
                  <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: 0 }}>
                    {hoursLabel}
                  </p>
                  {outlet.phone && (
                    <a href={'tel:' + outlet.phone} style={{ display: 'block', fontFamily: FB, fontSize: 13, color: ACCENT_TEXT, marginTop: 4, textDecoration: 'none', fontWeight: 600 }}>
                      {outlet.phone}
                    </a>
                  )}
                  {isExpanded && <HoursTooltip opening_hours={outlet.opening_hours} />}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  {/* Part B.5 — the Select/Active switcher only makes sense with
                      more than one location; a single location is always "it". */}
                  {outlets.length > 1 && (
                    <button
                      onClick={() => handleSetActive(outlet.id)}
                      style={{
                        background: isActive ? ACCENT : 'rgba(0,0,0,0.06)',
                        color: isActive ? ACCENT_TEXT : INK,
                        border: 'none', borderRadius: 12, padding: '8px 16px',
                        fontFamily: FB, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {isActive ? 'Active' : 'Select'}
                    </button>
                  )}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : outlet.id)}
                    style={{
                      background: 'none', border: 'none', fontFamily: FB, fontSize: 12,
                      color: INK_MUTED, cursor: 'pointer', textDecoration: 'underline', padding: 0,
                    }}
                  >
                    {isExpanded ? 'Less' : 'Hours'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <CxTabBar slug={slug} active="locations" />
    </div>
  )
}