'use client'
import Link from 'next/link'

// What's-new + customer-facing feature tiles for the dashboard homepage.
// Helps owners discover the surfaces that shipped without prominent links.

const WHATS_NEW = [
  { href: '/dashboard/community', label: 'Aria Community', blurb: 'Your shop, in a local social feed', emoji: '✦' },
  { href: '/dashboard/marketplace', label: 'Marketplace', blurb: 'List products, chat to sell', emoji: '🛍' },
  { href: '/dashboard/community/marketer', label: 'Aria Marketer', blurb: 'A week of posts, drafted for you', emoji: '🤖' },
]

const SURFACES = [
  { href: '/dashboard/in-store', label: 'In-Store Kiosk', blurb: 'Tablet AI for walk-in customers' },
  { href: '/dashboard/community/profile', label: 'Community profile', blurb: 'How customers see your shop' },
  { href: '/dashboard/community/marketer', label: 'Aria Marketer', blurb: 'Auto-draft + cross-post' },
  { href: '/dashboard/marketplace', label: 'Marketplace', blurb: 'Listings + enquiries' },
]

export function CustomerSurfaces() {
  return (
    <div className="space-y-4">
      {/* What's New strip */}
      <div className="rounded-2xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-[.12em] px-2 py-0.5 rounded-full" style={{ background: 'rgba(217,245,78,0.22)', color: '#a5c400' }}>What&apos;s new</span>
          <span className="text-[11px] text-[rgba(255,255,255,0.4)]">recently shipped — tap to explore</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {WHATS_NEW.map(t => (
            <Link key={t.href} href={t.href}
              className="rounded-xl p-3.5 transition-colors"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-lg mb-1.5">{t.emoji}</div>
              <div className="text-[13px] font-semibold text-white">{t.label}</div>
              <div className="text-[11px] text-[rgba(255,255,255,0.45)] mt-0.5 leading-snug">{t.blurb}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Customer-facing surfaces */}
      <div className="rounded-2xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[rgba(255,255,255,0.4)] mb-3">Customer-facing</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SURFACES.map(t => (
            <Link key={t.href + t.label} href={t.href}
              className="rounded-xl p-3 transition-colors hover:bg-[rgba(255,255,255,0.05)]"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-[12.5px] font-semibold text-white leading-tight">{t.label}</div>
              <div className="text-[10px] text-[rgba(255,255,255,0.42)] mt-1 leading-snug">{t.blurb}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
