'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG = '#fafafa'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#777'
const CARD_DARK = '#0f0f0f'
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
}

interface CxCustomer {
  customer_id: string
  name: string
  points_balance: number
  loyalty_tier: string | null
  visit_count: number
  stamps_count: number
  total_spent: string
}

type Phase = 'init' | 'guest' | 'entry' | 'loading' | 'ready' | 'notfound'

// ── Hub click tracker (preserved) ─────────────────────────────────────────────

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

// ── Points ring (SVG donut) ───────────────────────────────────────────────────

function PointsRing({ points, threshold }: { points: number; threshold: number | null }) {
  const R = 58
  const C = 2 * Math.PI * R
  const pct = threshold && threshold > 0 ? Math.min(1, points / threshold) : (points > 0 ? 0.4 : 0.04)
  const fill = pct * C
  return (
    <svg width={144} height={144} viewBox="0 0 144 144" aria-hidden="true" style={{ display: 'block' }}>
      <circle cx={72} cy={72} r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={9} />
      {fill > 0 && (
        <circle
          cx={72} cy={72} r={R} fill="none"
          stroke={ACCENT} strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={String(fill) + ' ' + String(C - fill)}
          transform="rotate(-90 72 72)"
        />
      )}
    </svg>
  )
}

// ── Loyalty card ──────────────────────────────────────────────────────────────

function LoyaltyCard({ biz, cx, phase, greeting, onCheckRewards }: {
  biz: HubBusiness
  cx: CxCustomer | null
  phase: Phase
  greeting: string
  onCheckRewards: () => void
}) {
  const pts = cx?.points_balance ?? 0
  const tier = (cx?.loyalty_tier) ?? 'Member'
  const firstName = cx?.name?.split(' ')[0] ?? null

  return (
    <div style={{
      borderRadius: 24, background: CARD_DARK, padding: 24,
      marginBottom: 18, position: 'relative', overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
    }}>
      {/* Ambient lime glow */}
      <div style={{
        position: 'absolute', top: -50, right: -50, width: 180, height: 180,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(217,245,78,0.16) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Greeting */}
      <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 21, color: '#fff', margin: '0 0 18px', fontWeight: 400, lineHeight: 1.2, position: 'relative' }}>
        {firstName ? (greeting + ', ' + firstName) : (biz.name + ' loyalty')}
      </p>

      {phase === 'ready' && cx ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative' }}>
          {/* Ring */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <PointsRing points={pts} threshold={biz.rewardThreshold} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 38, fontWeight: 600, color: '#fff', lineHeight: 1 }}>{pts}</div>
              <div style={{ fontFamily: FB, fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>pts</div>
            </div>
          </div>
          {/* Right side */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '3px 14px', fontFamily: FB, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
              {tier}
            </div>
            {cx.visit_count > 0 && (
              <p style={{ fontFamily: FB, fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '0 0 5px' }}>
                {cx.visit_count} visit{cx.visit_count !== 1 ? 's' : ''}
              </p>
            )}
            {biz.rewardThreshold && pts < biz.rewardThreshold && (
              <p style={{ fontFamily: FB, fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
                {biz.rewardThreshold - pts} pts to next reward
              </p>
            )}
            {biz.rewardThreshold && pts >= biz.rewardThreshold && (
              <p style={{ fontFamily: FB, fontSize: 12, color: ACCENT, margin: 0, fontWeight: 600 }}>
                Reward ready!
              </p>
            )}
          </div>
        </div>
      ) : phase === 'notfound' ? (
        <div style={{ textAlign: 'center', padding: '8px 0', position: 'relative' }}>
          <p style={{ fontFamily: FB, fontSize: 14, color: 'rgba(255,255,255,0.55)', margin: '0 0 16px' }}>
            No membership found for that number.
          </p>
          <a href={'/loyalty/' + biz.id} style={{ display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '10px 24px', fontFamily: FB, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            Join rewards
          </a>
        </div>
      ) : (
        // guest / loading / init
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <PointsRing points={0} threshold={null} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
              <div style={{ fontSize: 26 }}>★</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 17, color: '#fff', margin: '0 0 14px', lineHeight: 1.35 }}>
              Earn points every visit
            </p>
            {phase === 'loading' ? (
              <div style={{ width: 28, height: 28, border: '2.5px solid ' + ACCENT, borderTopColor: 'transparent', borderRadius: '50%', animation: 'cx-spin 0.75s linear infinite' }} />
            ) : (
              <button onClick={onCheckRewards} style={{ background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 100, padding: '10px 22px', fontFamily: FB, fontSize: 14, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.01em' }}>
                Check my rewards
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Phone entry form ──────────────────────────────────────────────────────────

function PhoneEntry({ slug, bizId, onSuccess, onCancel }: {
  slug: string
  bizId: string
  onSuccess: (cx: CxCustomer) => void
  onCancel: () => void
}) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const lookup = async () => {
    const raw = phone.trim()
    if (!raw) { setMsg('Enter your phone number'); return }
    setLoading(true); setMsg('')
    try {
      const res = await fetch('/api/public/cx/' + slug + '/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: raw }),
      })
      const data = (await res.json()) as { found: boolean } & Partial<CxCustomer>
      if (data.found) {
        try { localStorage.setItem('aria_cx_' + slug, JSON.stringify({ phone: raw })) } catch { /* ok */ }
        onSuccess(data as CxCustomer)
      } else {
        setMsg("No membership found with that number.")
      }
    } catch {
      setMsg('Something went wrong. Try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: 22, marginBottom: 18, boxShadow: '0 4px 20px rgba(0,0,0,0.07)' }}>
      <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, margin: '0 0 14px', color: INK, fontWeight: 500 }}>
        Check your rewards
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') lookup() }}
          placeholder="Your phone number"
          style={{ flex: 1, border: '1.5px solid ' + INK, borderRadius: 12, padding: '12px 14px', fontFamily: FB, fontSize: 15, outline: 'none', background: BG, color: INK, minWidth: 0 }}
        />
        <button
          onClick={lookup}
          disabled={loading}
          style={{ background: INK, color: BG, border: 'none', borderRadius: 12, padding: '12px 18px', fontFamily: FB, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, flexShrink: 0 }}
        >
          {loading ? '…' : 'Go'}
        </button>
      </div>
      {msg && <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '10px 0 0' }}>{msg}</p>}
      <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
        <a href={'/loyalty/' + bizId} style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, textDecoration: 'underline' }}>
          Join rewards
        </a>
        <button onClick={onCancel} style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Product horizontal scroll ─────────────────────────────────────────────────

function ProductScroll({ products, slug }: { products: HubBusiness['products']; slug: string }) {
  if (!products.length) return null
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h2 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, fontWeight: 600, margin: 0, color: INK }}>
          Today&apos;s picks
        </h2>
        <a href={'/menu/' + slug} style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, textDecoration: 'none' }}>
          See all →
        </a>
      </div>
      <div className="cx-hscroll" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' as const }}>
        {products.map(p => (
          <a key={p.id} href={'/menu/' + slug} style={{ flexShrink: 0, width: 138, borderRadius: 20, background: '#fff', overflow: 'hidden', boxShadow: '0 2px 14px rgba(0,0,0,0.07)', textDecoration: 'none', color: INK, display: 'block' }}>
            <div style={{ width: 138, height: 108, background: p.image_url ? ('url(' + p.image_url + ') center/cover no-repeat #efefef') : '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#ccc' }}>
              {!p.image_url && '☕'}
            </div>
            <div style={{ padding: '10px 12px 12px' }}>
              <p style={{ fontFamily: FB, fontSize: 13, fontWeight: 600, margin: '0 0 3px', color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
              <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: 0 }}>{'$' + (Number(p.price) || 0).toFixed(2)}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

// ── Hub feature cards (preserved from original) ────────────────────────────────

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
      <h2 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, fontWeight: 600, margin: '0 0 12px', color: INK }}>Quick links</h2>
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

// ── Tab bar (frosted glass, pinned) ───────────────────────────────────────────

function CxTabBar({ slug }: { slug: string }) {
  const pathname = usePathname()
  const base = '/' + slug
  type TabDef = { key: string; label: string; icon: string; href: string; enabled: boolean }
  const tabs: TabDef[] = [
    { key: 'home',    label: 'Home',    icon: '⌂', href: base,                enabled: true },
    { key: 'rewards', label: 'Rewards', icon: '★', href: base + '/rewards',   enabled: false },
    { key: 'wallet',  label: 'Wallet',  icon: '◎', href: base + '/wallet',    enabled: false },
    { key: 'menu',    label: 'Menu',    icon: '▤', href: '/menu/' + slug,     enabled: true },
  ]

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 64, zIndex: 1000,
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      background: 'rgba(250,250,250,0.9)',
      borderTop: '1px solid rgba(10,10,10,0.1)',
      display: 'flex', alignItems: 'stretch',
    }}>
      {tabs.map(t => {
        const active = pathname === t.href
        return t.enabled ? (
          <a
            key={t.key}
            href={t.href}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, textDecoration: 'none', color: active ? INK : '#aaa', paddingBottom: 6, position: 'relative' }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontFamily: FB, fontSize: 10, fontWeight: active ? 700 : 400, letterSpacing: '0.02em' }}>{t.label}</span>
            {active && (
              <span style={{ position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: '50%', background: ACCENT }} />
            )}
          </a>
        ) : (
          <div
            key={t.key}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: '#ccc', paddingBottom: 6 }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontFamily: FB, fontSize: 10, letterSpacing: '0.02em' }}>{t.label}</span>
          </div>
        )
      })}
    </nav>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function HubClient({ business: b }: { business: HubBusiness }) {
  const [phase, setPhase] = useState<Phase>('init')
  const [cx, setCx] = useState<CxCustomer | null>(null)
  const [greeting, setGreeting] = useState('Welcome')

  useEffect(() => {
    // Time-appropriate greeting (client-only — avoids hydration mismatch)
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')

    // Hub view tracking (preserved)
    track(b.id, 'hub_view')

    // Restore saved session from localStorage
    try {
      const saved = localStorage.getItem('aria_cx_' + b.slug)
      if (saved) {
        const parsed = JSON.parse(saved) as { phone?: string }
        const phone = parsed.phone ?? ''
        if (phone) {
          setPhase('loading')
          fetch('/api/public/cx/' + b.slug + '/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone }),
          })
            .then(r => r.json())
            .then((data: { found: boolean } & Partial<CxCustomer>) => {
              if (data.found) {
                setCx(data as CxCustomer)
                setPhase('ready')
              } else {
                localStorage.removeItem('aria_cx_' + b.slug)
                setPhase('guest')
              }
            })
            .catch(() => setPhase('guest'))
          return
        }
      }
    } catch { /* no localStorage */ }
    setPhase('guest')
  }, [b.id, b.slug])

  const onCheckRewards = () => setPhase('entry')
  const onPhoneSuccess = (customer: CxCustomer) => { setCx(customer); setPhase('ready') }
  const onPhoneCancel = () => setPhase('guest')

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK, paddingBottom: 80 }}>
      <style>{`
        @keyframes cx-spin { to { transform: rotate(360deg) } }
        .cx-hscroll::-webkit-scrollbar { display: none }
      `}</style>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 18px 0' }}>

        {/* Business header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          {b.logoUrl ? (
            <div style={{ width: 50, height: 50, borderRadius: 14, background: 'url(' + b.logoUrl + ') center/cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 50, height: 50, borderRadius: 14, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: ACCENT_TEXT, flexShrink: 0 }}>
              {b.name[0]}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 26, fontWeight: 600, margin: 0, lineHeight: 1.1 }}>
              {b.name}
              {b.verified && <span title="Verified" style={{ fontSize: 13, marginLeft: 6, verticalAlign: 'middle' }}>✔</span>}
            </h1>
            {b.city && <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '2px 0 0' }}>{b.city}</p>}
          </div>
        </div>

        {/* Loyalty card — hidden during init to avoid layout flash */}
        {phase !== 'init' && (
          <LoyaltyCard
            biz={b}
            cx={cx}
            phase={phase}
            greeting={greeting}
            onCheckRewards={onCheckRewards}
          />
        )}

        {/* Phone entry form */}
        {phase === 'entry' && (
          <PhoneEntry
            slug={b.slug}
            bizId={b.id}
            onSuccess={onPhoneSuccess}
            onCancel={onPhoneCancel}
          />
        )}

        {/* Product highlights */}
        <ProductScroll products={b.products} slug={b.slug} />

        {/* Hub feature cards (preserved from original hub) */}
        {b.bio && (
          <p style={{ fontFamily: FB, fontSize: 14, color: '#444', lineHeight: 1.55, margin: '0 0 20px', padding: '16px 18px', background: '#fff', borderRadius: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>{b.bio}</p>
        )}
        <HubLinks biz={b} onTrack={t => track(b.id, t)} />

        {/* Footer (preserved) */}
        <div style={{ textAlign: 'center', marginTop: 16, marginBottom: 14, fontFamily: FB, fontSize: 12, color: INK_MUTED }}>
          <span>Powered by Aria</span>
          <span style={{ margin: '0 8px' }}>·</span>
          <a href={'mailto:support@ariaos.site?subject=Report%20page%20' + encodeURIComponent(b.slug)} style={{ color: INK_MUTED }}>
            Report this page
          </a>
        </div>
      </div>

      {/* Scan / rewards pill (frosted glass, above tab bar) */}
      {phase !== 'init' && (
        <div style={{ position: 'fixed', bottom: 74, left: '50%', transform: 'translateX(-50%)', zIndex: 999 }}>
          <button
            onClick={phase === 'ready' ? undefined : onCheckRewards}
            style={{
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              background: phase === 'ready' ? 'rgba(217,245,78,0.92)' : 'rgba(10,10,10,0.8)',
              color: phase === 'ready' ? ACCENT_TEXT : BG,
              border: '1px solid ' + (phase === 'ready' ? 'rgba(217,245,78,0.5)' : 'rgba(255,255,255,0.15)'),
              borderRadius: 100,
              padding: '11px 26px',
              fontFamily: FB,
              fontSize: 14,
              fontWeight: 600,
              cursor: phase === 'ready' ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            }}
          >
            {phase === 'ready' ? ('✓ ' + (cx?.points_balance ?? 0) + ' pts') : '↑ Check rewards'}
          </button>
        </div>
      )}

      {/* Tab bar */}
      <CxTabBar slug={b.slug} />
    </div>
  )
}