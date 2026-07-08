'use client'
import { useState, useEffect } from 'react'
import { CxTabBar } from './CxTabBar'

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const CARD_DARK = '#14130f'
const FD = "var(--font-display,'Cormorant',Georgia,serif)"
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HubBusiness {
  id: string
  name: string
  slug: string
  city: string | null
  bio: string | null
  logoUrl: string | null
  verified: boolean
  features: string[]
  bookingSlug: string | null
  website: string | null
  reviewUrl: string | null
  products: Array<{ id: string; name: string; price: number; image_url: string | null; description: string | null }>
  rewardThreshold: number | null
  heroImageUrl: string | null
  latestPost: { title: string; excerpt: string; imageUrl: string | null } | null
}

interface UsualProduct {
  name: string
  price: number
  image_url: string | null
  product_id: string | null
}

export interface CxCustomer {
  customer_id: string
  name: string
  points_balance: number
  loyalty_tier: string | null
  visit_count: number
  stamps_count: number
  total_spent: string
  loyalty_identity_id: string | null
  wallet_balance: number
  wallet_currency: string
  challenges: unknown[]
  recent_txns: unknown[]
  preload_txns: unknown[]
  usual_product: UsualProduct | null
}

type Phase = 'guest' | 'ready'

// ── Analytics ─────────────────────────────────────────────────────────────────

function visitorId(): string {
  try {
    let v = localStorage.getItem('aria_hub_visitor')
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem('aria_hub_visitor', v)
    }
    return v
  } catch { return 'anon' }
}

async function track(businessId: string, target: string) {
  try {
    await fetch('/api/hub/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        target,
        visitor_id: visitorId(),
        referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      }),
      keepalive: true,
    })
  } catch { /* fire-and-forget */ }
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IconPerson({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <circle cx="8" cy="5" r="3"/>
      <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" opacity="0.7"/>
    </svg>
  )
}

// ── "Your usual" strip ────────────────────────────────────────────────────────

function UsualStrip({ usual, slug }: { usual: UsualProduct; slug: string }) {
  return (
    <div style={{ padding: '18px 18px 0', marginBottom: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: '#fff', borderRadius: 20, padding: '14px 14px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 16, flexShrink: 0, overflow: 'hidden',
          background: usual.image_url ? ('url(' + usual.image_url + ') center/cover no-repeat #efefef') : '#efefef',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
        }}>
          {!usual.image_url && '☕'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: FB, fontSize: 16, fontWeight: 700, color: INK, margin: '0 0 1px', lineHeight: 1.2 }}>
            Your usual,
          </p>
          <p style={{ fontFamily: FB, fontSize: 16, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.2 }}>
            ready in 4 min?
          </p>
          {usual.name && (
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 12, color: INK_MUTED, margin: '4px 0 0' }}>
              {usual.name}
            </p>
          )}
        </div>
        <a
          href={'/menu/' + slug}
          style={{
            flexShrink: 0, background: ACCENT, color: ACCENT_TEXT,
            borderRadius: 14, padding: '10px 14px',
            fontFamily: FB, fontSize: 13, fontWeight: 700,
            textDecoration: 'none',
            display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8,
            boxShadow: '0 0 18px 4px rgba(217,245,78,0.5), inset 0 1px 0 rgba(255,255,255,0.35)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ display: 'block', flexShrink: 0 }}>
            <path d="M15 7h1a3 3 0 010 6h-1"/>
            <path d="M2 7h13v7a3 3 0 01-3 3H5a3 3 0 01-3-3V7z"/>
            <path d="M5.5 1v2M8.5 1v2M11.5 1v2"/>
          </svg>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span>Reorder</span>
            <span style={{ fontFamily: FB, fontSize: 11, fontWeight: 500, opacity: 0.75 }}>
              {'$' + usual.price.toFixed(2)}
            </span>
          </span>
        </a>
      </div>
    </div>
  )
}

// ── Product horizontal scroll ─────────────────────────────────────────────────

function ProductScroll({ products, slug }: { products: HubBusiness['products']; slug: string }) {
  if (!products.length) return null
  return (
    <div style={{ padding: '0 0 0', marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 18px', marginBottom: 12 }}>
        <h2 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, fontWeight: 600, margin: 0, color: INK }}>
          Today&apos;s picks
        </h2>
        <a href={'/menu/' + slug} style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, textDecoration: 'none' }}>
          See all →
        </a>
      </div>
      <div
        className="cx-hscroll"
        style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', paddingLeft: 18, paddingRight: 18 }}
      >
        {products.map(p => (
          <a
            key={p.id}
            href={'/menu/' + slug}
            style={{ flexShrink: 0, width: 160, borderRadius: 16, background: '#fff', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', textDecoration: 'none', color: INK, display: 'block' }}
          >
            <div style={{
              width: 160, height: 150,
              background: p.image_url ? ('url(' + p.image_url + ') center/cover no-repeat #efefef') : '#efefef',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#ccc',
            }}>
              {!p.image_url && '☕'}
            </div>
            <div style={{ padding: '9px 10px 11px' }}>
              <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 14, fontWeight: 600, margin: '0 0 3px', color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.name}
              </p>
              <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: INK, margin: 0 }}>
                {'$' + (Number(p.price) || 0).toFixed(2)}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

// ── "What's new" event card ───────────────────────────────────────────────────

function WhatsNewCard({ post, slug }: { post: HubBusiness['latestPost']; slug: string }) {
  if (!post) return null
  return (
    <div style={{ padding: '0 18px', marginBottom: 22 }}>
      <a
        href={'/community/businesses/' + slug}
        style={{ display: 'flex', gap: 14, background: CARD_DARK, borderRadius: 20, overflow: 'hidden', textDecoration: 'none', alignItems: 'center', padding: 16 }}
      >
        {post.imageUrl && (
          <div style={{
            width: 80, height: 80, borderRadius: 14, flexShrink: 0, overflow: 'hidden',
            background: 'url(' + post.imageUrl + ') center/cover no-repeat #222',
          }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: '#fff', margin: '0 0 6px', fontWeight: 600, lineHeight: 1.2 }}>
            {"What’s new — " + post.title}
          </p>
          {post.excerpt && (
            <p style={{ fontFamily: FB, fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '0 0 10px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {post.excerpt}
            </p>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '5px 12px', fontFamily: FB, fontSize: 11, fontWeight: 700, boxShadow: '0 0 12px rgba(217,245,78,0.4)' }}>
            View →
          </span>
        </div>
      </a>
    </div>
  )
}

// ── Hub feature cards (preserved) ─────────────────────────────────────────────

function HubLinks({ biz, onTrack }: { biz: HubBusiness; onTrack: (t: string) => void }) {
  const has = (f: string) => biz.features.includes(f)
  type HubCard = { target: string; title: string; sub: string; href: string; external?: boolean; emoji: string }
  const cards: HubCard[] = []
  if (has('loyalty'))
    cards.push({ target: 'loyalty', title: 'Loyalty rewards', sub: 'Earn points every visit', href: '/loyalty/' + biz.id, emoji: '⭐' })
  if (has('booking') && biz.bookingSlug)
    cards.push({ target: 'booking', title: 'Book with us', sub: 'Reserve a table or appointment', href: '/book/' + biz.bookingSlug, emoji: '📅' })
  if (has('community'))
    cards.push({ target: 'community', title: 'Follow on Aria', sub: 'Latest posts & offers', href: '/community/businesses/' + biz.id, emoji: '💬' })
  if (has('review') && biz.reviewUrl)
    cards.push({ target: 'review', title: 'Leave a review', sub: 'Tell others about your visit', href: biz.reviewUrl, external: true, emoji: '⭐' })
  if (has('website') && biz.website)
    cards.push({ target: 'website', title: 'Visit our website', sub: (biz.website as string).replace(/^https?:\/\/(www\.)?/, ''), href: biz.website, external: true, emoji: '🌐' })
  if (!cards.length) return null
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, fontWeight: 600, margin: '0 0 12px', color: INK }}>
        Quick links
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cards.map(c => (
          <a
            key={c.target}
            href={c.href}
            target={c.external ? '_blank' : undefined}
            rel={c.external ? 'noopener noreferrer' : undefined}
            onClick={() => onTrack(c.target)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', borderRadius: 18, padding: '14px 16px', textDecoration: 'none', color: INK, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}
          >
            <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{c.emoji}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: FB, fontSize: 15, fontWeight: 600 }}>{c.title}</span>
              <span style={{ display: 'block', fontFamily: FB, fontSize: 13, color: INK_MUTED, marginTop: 1 }}>{c.sub}</span>
            </span>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0, color: ACCENT_TEXT }}>→</span>
          </a>
        ))}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function HubClient({ business: b, initialCustomer }: { business: HubBusiness; initialCustomer: CxCustomer | null }) {
  const phase: Phase = initialCustomer ? 'ready' : 'guest'
  const [cx] = useState<CxCustomer | null>(initialCustomer)
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
    void track(b.id, 'hub_view')
  }, [b.id])

  const firstName = cx?.name?.split(' ')[0] ?? null
  const pts = cx?.points_balance ?? 0
  const tier = cx?.loyalty_tier ?? 'Member'
  const walletBal = (cx?.wallet_balance ?? 0).toFixed(2)

  const warmGrad = 'radial-gradient(ellipse at 40% 65%, #6b3a1f 0%, #3d1f0a 55%, #1e0f04 100%)'
  const heroBg = b.heroImageUrl
    ? ('url(' + b.heroImageUrl + ') center / cover no-repeat, ' + warmGrad)
    : warmGrad

  return (
    <div style={{ width: '100%', maxWidth: '28rem', margin: '0 auto', minHeight: '100dvh', background: BG, fontFamily: FB, color: INK }}>
      <style>{`
        body { background: #f3efe4 }
        @keyframes cx-spin { to { transform: rotate(360deg) } }
        .cx-hscroll::-webkit-scrollbar { display: none }
        *, *::before, *::after { box-sizing: border-box }
        .-webkit-line-clamp { -webkit-line-clamp: 2; -webkit-box-orient: vertical; display: -webkit-box; overflow: hidden }
      `}</style>

      {/* ── HERO ── 45vh responsive, square bottom, sheet overlaps from below ─── */}
      <div style={{ position: 'relative', height: '45vh', maxHeight: 420, minHeight: 340, zIndex: 1 }}>

        {/* bg + gradient — full bleed, no radius */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: heroBg }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.42) 0%, transparent 38%, transparent 48%, rgba(0,0,0,0.72) 100%)',
          }} />
        </div>

        {/* ── Header row ── overlaid on hero ────────────────────────── */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '52px 18px 0',
        }}>
          {/* Left: logo circle + wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
              background: b.logoUrl ? ('url(' + b.logoUrl + ') center/cover') : 'rgba(255,255,255,0.2)',
              boxShadow: '0 0 14px rgba(217,245,78,0.4), 0 2px 10px rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: FB, fontSize: 16, fontWeight: 800, color: '#fff',
            }}>
              {!b.logoUrl && b.name[0]}
            </div>
            <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, color: '#fff', fontWeight: 600, letterSpacing: '-0.01em', textShadow: '0 1px 8px rgba(0,0,0,0.4)' }}>
              {b.name}
              {b.verified && (
                <span style={{ fontSize: 12, marginLeft: 5, opacity: 0.85 }}>✔</span>
              )}
            </span>
          </div>

          {/* Right: account avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <a
              href={'/' + b.slug + '/account'}
              style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.18)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1.5px solid rgba(255,255,255,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', textDecoration: 'none',
              }}
            >
              <IconPerson size={16} />
            </a>
          </div>
        </div>

        {/* ── Greeting — lower third of hero ─────────────────────── */}
        {greeting && (
          <div style={{ position: 'absolute', bottom: 64, left: 0, right: 0, padding: '0 20px' }}>
            <p style={{
              fontFamily: FD, fontStyle: 'italic',
              fontSize: 46,
              color: '#fff', margin: 0, fontWeight: 400, lineHeight: 1.1,
              textShadow: '0 2px 20px rgba(0,0,0,0.55)',
            }}>
              {greeting + (firstName ? ',' : '')}
              {firstName && <span style={{ display: 'block' }}>{firstName}</span>}
            </p>
          </div>
        )}

      </div>

      {/* ── Content sheet — rounds up over square hero bottom, pill straddles its curved top ── */}
      <div style={{ borderRadius: '24px 24px 0 0', background: BG, marginTop: -24, position: 'relative', zIndex: 2, paddingBottom: 100 }}>

        {/* ── Status pill — anchored to sheet curved top, translateY(-50%) straddles edge ── */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 10 }}>
          {phase === 'ready' ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              background: 'rgba(255,255,255,0.30)',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 100, padding: '9px 20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
              transform: 'translateY(-50%)',
            }}>
              <span style={{ fontFamily: FB, fontSize: 14, color: '#fff', fontWeight: 700 }}>{pts + ' pts'}</span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>·</span>
              <span style={{ fontFamily: FB, fontSize: 14, color: '#fff', fontWeight: 600 }}>{tier}</span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>·</span>
              <span style={{ fontFamily: FB, fontSize: 14, color: '#fff', fontWeight: 600 }}>{'$' + walletBal}</span>
            </div>
          ) : phase === 'guest' ? (
            <a
              href={'/' + b.slug + '/onboarding'}
              style={{
                background: 'rgba(255,255,255,0.30)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: 100, padding: '9px 20px',
                fontFamily: FB, fontSize: 14, color: '#fff', fontWeight: 600,
                transform: 'translateY(-50%)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
                textDecoration: 'none', display: 'inline-block',
              }}
            >
              Sign in for rewards
            </a>
          ) : null}
        </div>

        {/* Spacer: clears the straddling pill (~19px above seam + breathing room) */}
        <div style={{ height: 52 }} />

        {/* Your usual strip */}
        {phase === 'ready' && cx?.usual_product && (
          <UsualStrip usual={cx.usual_product} slug={b.slug} />
        )}

        {/* Products */}
        <div style={{ marginTop: phase === 'ready' && cx?.usual_product ? 0 : 8 }}>
          <ProductScroll products={b.products} slug={b.slug} />
        </div>

        {/* What's new */}
        <WhatsNewCard post={b.latestPost} slug={b.slug} />

        {/* Bio */}
        {b.bio && (
          <div style={{ padding: '0 18px', marginBottom: 20 }}>
            <p style={{ fontFamily: FB, fontSize: 14, color: '#444', lineHeight: 1.6, margin: 0, padding: '16px 18px', background: '#fff', borderRadius: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
              {b.bio}
            </p>
          </div>
        )}

        {/* Hub feature links (preserved) */}
        <div style={{ padding: '0 18px' }}>
          <HubLinks biz={b} onTrack={t => void track(b.id, t)} />
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '16px 18px 8px', fontFamily: FB, fontSize: 12, color: INK_MUTED }}>
          <span>Powered by Aria</span>
          <span style={{ margin: '0 8px' }}>·</span>
          <a href={'mailto:support@ariaos.site?subject=Report%20page%20' + encodeURIComponent(b.slug)} style={{ color: INK_MUTED }}>
            Report this page
          </a>
        </div>
      </div>

      {/* Tab bar */}
      <CxTabBar slug={b.slug} active="home" />
    </div>
  )
}