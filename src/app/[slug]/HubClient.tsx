'use client'
import { useEffect } from 'react'

// Locked Pipel design (prompt 83) — light, ink-on-cream, hard 1.5px borders, Inter.
const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e'
const BORDER = `1.5px solid ${INK}`
const FONT = 'Inter, system-ui, -apple-system, sans-serif'

export interface HubBusiness {
  id: string; name: string; slug: string; city: string | null; bio: string | null
  logoUrl: string | null; verified: boolean; features: string[]
  bookingSlug: string | null; website: string | null; reviewUrl: string | null
}

interface Card { target: string; title: string; sub: string; href: string; external?: boolean }

function visitorId(): string {
  try {
    let v = localStorage.getItem('aria_hub_visitor')
    if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('aria_hub_visitor', v) }
    return v
  } catch { return 'anon' }
}

async function track(businessId: string, target: string) {
  try {
    await fetch('/api/hub/click', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, target, visitor_id: visitorId(), referrer: document.referrer || null }),
      keepalive: true,
    })
  } catch { /* fire-and-forget */ }
}

export function HubClient({ business: b }: { business: HubBusiness }) {
  useEffect(() => { track(b.id, 'hub_view') }, [b.id])

  const has = (f: string) => b.features.includes(f)
  const cards: Card[] = []
  if (has('loyalty')) cards.push({ target: 'loyalty', title: 'Join loyalty', sub: 'Earn points every visit', href: `/loyalty/${b.id}` })
  if (has('booking') && b.bookingSlug) cards.push({ target: 'booking', title: 'Book with us', sub: 'Reserve a table or appointment', href: `/book/${b.bookingSlug}` })
  if (has('community')) cards.push({ target: 'community', title: 'Follow on Aria Community', sub: 'See our latest posts & offers', href: `/community/businesses/${b.id}` })
  if (has('review') && b.reviewUrl) cards.push({ target: 'review', title: 'Leave a review', sub: 'Tell others about your visit', href: b.reviewUrl, external: true })
  if (has('website') && b.website) cards.push({ target: 'website', title: 'Visit our website', sub: b.website.replace(/^https?:\/\/(www\.)?/, ''), href: b.website, external: true })

  return (
    <div style={{ minHeight: '100vh', background: CREAM, fontFamily: FONT, color: INK, padding: '32px 18px 48px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* Hero */}
        <div style={{ background: SURFACE, border: BORDER, borderRadius: 22, padding: 22, boxShadow: '4px 4px 0 #0a0a0a', textAlign: 'center', marginBottom: 22 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, border: BORDER, margin: '0 auto 12px', background: b.logoUrl ? `url(${b.logoUrl}) center/cover` : ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800 }}>
            {!b.logoUrl && (b.name[0] ?? '?')}
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0, fontFamily: "'Fraunces', serif", fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            {b.name}
            {b.verified && <span title="Verified" style={{ fontSize: 16 }}>✔</span>}
          </h1>
          {b.city && <p style={{ fontSize: 13, color: INK_SOFT, margin: '4px 0 0' }}>{b.city}</p>}
          {b.bio && <p style={{ fontSize: 14, color: '#333', margin: '10px 0 0', lineHeight: 1.5 }}>{b.bio}</p>}
        </div>

        {/* Feature cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cards.length === 0 ? (
            <p style={{ textAlign: 'center', color: INK_SOFT, fontSize: 14 }}>This shop hasn&apos;t set up its hub yet.</p>
          ) : cards.map(c => (
            <a key={c.target} href={c.href}
              target={c.external ? '_blank' : undefined} rel={c.external ? 'noopener noreferrer' : undefined}
              onClick={() => track(b.id, c.target)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, background: SURFACE, border: BORDER, borderRadius: 18, padding: '16px 18px', textDecoration: 'none', color: INK, boxShadow: '3px 3px 0 #0a0a0a' }}>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 700 }}>{c.title}</span>
                <span style={{ display: 'block', fontSize: 13, color: INK_SOFT, marginTop: 2 }}>{c.sub}</span>
              </span>
              <span style={{ width: 34, height: 34, borderRadius: 11, border: BORDER, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>→</span>
            </a>
          ))}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 28, fontSize: 12, color: INK_SOFT }}>
          <span>Powered by Aria</span>
          <span style={{ margin: '0 8px' }}>·</span>
          <a href={`mailto:support@ariaos.site?subject=Report%20page%20${encodeURIComponent(b.slug)}`} style={{ color: INK_SOFT }}>Report this page</a>
        </div>
      </div>
    </div>
  )
}
