'use client'
import { useEffect, useState } from 'react'

// Locked Pipel design — light ink-on-cream, hard 1.5px borders, Cormorant + Outfit.
const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e'
const BORDER = `1.5px solid ${INK}`
const FONT = "var(--font-body, 'Outfit', system-ui, sans-serif)"
const DISPLAY = "var(--font-display, 'Cormorant', Georgia, serif)"

interface Biz { id: string; name: string; industry: string | null; suburb: string | null; logo_url: string | null; slug: string | null }

export default function LoyaltyDirectoryPage() {
  const [businesses, setBusinesses] = useState<Biz[] | null>(null)

  useEffect(() => {
    fetch('/api/loyalty/directory').then(r => r.json()).then(d => setBusinesses((d.businesses ?? []) as Biz[])).catch(() => setBusinesses([]))
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: CREAM, fontFamily: FONT, color: INK, padding: '32px 20px' }}>
      <div style={{ width: '100%', maxWidth: 520, margin: '0 auto' }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, textAlign: 'center', margin: '0 0 6px', fontFamily: DISPLAY, fontStyle: 'italic' }}>Aria Rewards</h1>
        <p style={{ textAlign: 'center', color: INK_SOFT, fontSize: 15, margin: '0 0 24px', lineHeight: 1.5 }}>One login for your rewards across every Aria business. Pick a place to view or join.</p>

        {businesses === null ? (
          <p style={{ textAlign: 'center', color: INK_SOFT }}>Loading…</p>
        ) : businesses.length === 0 ? (
          <div style={{ background: SURFACE, border: BORDER, borderRadius: 18, padding: 24, textAlign: 'center', boxShadow: '4px 4px 0 #0a0a0a' }}>
            <p style={{ color: INK_SOFT, margin: 0 }}>No rewards programmes are open for sign-up right now.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {businesses.map(b => (
              <a key={b.id} href={`/loyalty/${b.slug || b.id}/signin`} style={{ textDecoration: 'none', color: INK }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: SURFACE, border: BORDER, borderRadius: 16, padding: 16, boxShadow: '3px 3px 0 #0a0a0a' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, border: BORDER, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 800, fontSize: 22 }}>
                    {b.logo_url ? <img src={b.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (b.name?.[0] ?? '★')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{b.name}</p>
                    {(b.industry || b.suburb) && <p style={{ fontSize: 13, color: INK_SOFT, margin: '2px 0 0' }}>{[b.industry, b.suburb].filter(Boolean).join(' · ')}</p>}
                  </div>
                  <span style={{ fontSize: 18, color: INK_SOFT }}>→</span>
                </div>
              </a>
            ))}
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 22, fontSize: 12, color: INK_SOFT }}>Powered by Aria</div>
      </div>
    </div>
  )
}
