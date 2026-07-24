'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PALETTE, BORDER, RADIUS } from './theme'

// CX-CLARITY-1 — three lines that state the loop, shown once per (member, business). Dismissal:
// linked members persist server-side (community_member_loyalty_links.banner_dismissed_at, via the
// dismiss-banner route); anonymous/unlinked visitors use localStorage, per the task's own split —
// there's no server row to persist against for someone who hasn't linked yet.

function localKey(slug: string) { return `aria_community_banner_dismissed_${slug}` }

export function LoopExplainerBanner({ slug, businessName, linked, initialDismissed }: { slug: string; businessName: string; linked: boolean; initialDismissed: boolean }) {
  const [dismissed, setDismissed] = useState(true) // default hidden until the client-only check below runs (avoids a flash for the common already-dismissed case)

  useEffect(() => {
    if (linked) { setDismissed(initialDismissed); return }
    try { setDismissed(localStorage.getItem(localKey(slug)) === '1') } catch { setDismissed(false) }
  }, [slug, linked, initialDismissed])

  function dismiss() {
    setDismissed(true)
    if (linked) {
      fetch(`/api/community/businesses/${slug}/dismiss-banner`, { method: 'POST' }).catch(() => {})
    } else {
      try { localStorage.setItem(localKey(slug), '1') } catch { /* private-browsing etc — non-fatal, just re-shows next visit */ }
    }
  }

  if (dismissed) return null

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: PALETTE.surface, border: BORDER, borderRadius: RADIUS.lg, padding: '12px 14px', marginBottom: 12 }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>🎯</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: PALETTE.ink, margin: 0, lineHeight: 1.5 }}>
          Earn points every visit at {businessName}. Level up automatically. Unlock real rewards — right here.
        </p>
        {!linked && (
          <Link href={`/loyalty/${slug}`} prefetch={false} style={{
            display: 'inline-block', marginTop: 8, padding: '6px 14px', textDecoration: 'none',
            background: PALETTE.accent, color: PALETTE.ink, border: BORDER, borderRadius: RADIUS.pill,
            fontSize: 11, fontWeight: 700,
          }}>Join {businessName}&rsquo;s rewards</Link>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" style={{ background: 'transparent', border: 'none', color: PALETTE.inkSoft, cursor: 'pointer', fontSize: 16, padding: 2, lineHeight: 1, flexShrink: 0 }}>×</button>
    </div>
  )
}
