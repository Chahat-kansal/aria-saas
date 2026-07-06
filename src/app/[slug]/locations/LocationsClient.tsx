'use client'

import { useState } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#fafafa'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const CARD_BG = '#fff'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

type Outlet = {
  id: string
  name: string | null
  address: string | null
  phone: string | null
  is_default: boolean | null
  is_active: boolean | null
  opening_hours: unknown
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
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK, paddingBottom: 100 }}>
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
                background: CARD_BG, borderRadius: 20, marginBottom: 12,
                border: isActive ? ('2px solid ' + ACCENT) : '2px solid transparent',
                boxShadow: isActive ? ('0 0 0 1px ' + ACCENT + ', 0 4px 20px rgba(0,0,0,0.06)') : '0 2px 12px rgba(0,0,0,0.06)',
                padding: '18px 20px',
                transition: 'border 0.15s',
              }}
            >
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
                    <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '0 0 6px', lineHeight: 1.4 }}>
                      {outlet.address}
                    </p>
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