'use client'

import { useState, useEffect } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

type Offer = {
  id: string
  title: string
  description: string | null
  image_url: string | null
  offer_type: string | null
  point_cost: number | null
  starts_at: string | null
  ends_at: string | null
}

type Challenge = {
  id: string
  title: string
  description: string | null
  target_count: number
  progress: number
  reward_points: number
  status: string
  expires_at: string | null
}

type RewardRule = {
  id: string
  rule_type: string
  name: string
  description: string
  points_value: number
  threshold_value: number | null
}

const OFFER_TYPE_LABELS: Record<string, string> = {
  discount: 'Discount', redeem: 'Redeem', stamp: 'Stamp reward',
  event: 'Event', gift: 'Gift',
}

function formatExpiry(s: string | null): string | null {
  if (!s) return null
  const d = new Date(s)
  const diff = d.getTime() - Date.now()
  const days = Math.ceil(diff / 86400000)
  if (days < 0) return 'Expired'
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  if (days <= 7) return 'Expires in ' + days + ' days'
  return 'Expires ' + d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.65)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: 20,
      border: '1px solid rgba(0,0,0,0.05)',
      boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
      overflow: 'hidden',
      marginBottom: 10,
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p style={{ fontFamily: FB, fontSize: 11, fontWeight: 700, color: INK_MUTED, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '20px 0 8px', paddingLeft: 4 }}>
      {title}
    </p>
  )
}

export function OffersClient({ slug, bizName, offers: ssrOffers }: {
  slug: string
  bizName: string
  offers: Offer[]
}) {
  const [offers, setOffers] = useState<Offer[]>(ssrOffers)
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [rewardRules, setRewardRules] = useState<RewardRule[]>([])
  const [points, setPoints] = useState<number>(0)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Fetch reward rules always (business-level, not customer-specific)
    const rulesPromise = fetch('/api/public/cx/' + slug + '/reward-rules')
      .then(r => r.json())
      .then((d: { reward_rules?: RewardRule[] }) => setRewardRules(d.reward_rules ?? []))
      .catch(() => { /* ok */ })

    // Fetch customer data (cookie session auth, no phone needed) + offers in parallel
    Promise.all([
      fetch('/api/public/cx/' + slug + '/me', { method: 'POST' }).then(r => r.json()),
      fetch('/api/public/cx/' + slug + '/offers').then(r => r.json()),
      rulesPromise,
    ]).then(([meData, offData]) => {
      const me = meData as { customer_id?: string; points_balance?: number; challenges?: Challenge[] }
      const od = offData as { offers?: Offer[] }
      setCustomerId(me.customer_id ?? null)
      setPoints(Number(me.points_balance ?? 0))
      setChallenges((me.challenges ?? []).filter(c => c.status === 'active'))
      if (od.offers?.length) setOffers(od.offers)
    }).catch(() => { /* ok */ })
      .finally(() => setLoaded(true))
  }, [slug])

  const activeOffers = offers.filter(o => {
    const now = Date.now()
    if (o.ends_at && new Date(o.ends_at).getTime() < now) return false
    if (o.starts_at && new Date(o.starts_at).getTime() > now) return false
    return true
  })

  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FB, color: INK, paddingBottom: 'calc(80px + env(safe-area-inset-bottom) + 24px)', maxWidth: '28rem', margin: '0 auto' }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>

      {/* Header */}
      <div style={{ padding: '52px 20px 8px' }}>
        <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 38, margin: '0 0 2px', fontWeight: 400, color: INK }}>
          Offers
        </h1>
        <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: 0 }}>
          {'From ' + bizName}
        </p>
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Loading skeleton */}
        {!loaded && (
          <div style={{ paddingTop: 40, textAlign: 'center', color: INK_MUTED, fontFamily: FB, fontSize: 14 }}>
            Loading offers…
          </div>
        )}

        {loaded && activeOffers.length === 0 && challenges.length === 0 && rewardRules.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontFamily: FB, fontSize: 15, color: INK_MUTED, margin: '0 0 6px' }}>No active offers right now.</p>
            <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: 0 }}>Check back soon.</p>
          </div>
        )}

        {/* ── Active Offers ── */}
        {loaded && activeOffers.length > 0 && (
          <>
            <SectionHeader title="Active offers" />
            {activeOffers.map(offer => {
              const expiry = formatExpiry(offer.ends_at)
              const typeLabel = OFFER_TYPE_LABELS[offer.offer_type ?? ''] ?? offer.offer_type
              const canRedeem = !offer.point_cost || (offer.point_cost > 0 && points >= offer.point_cost)
              return (
                <GlassCard key={offer.id}>
                  {offer.image_url && (
                    <div style={{ height: 150, background: 'url(' + offer.image_url + ') center/cover no-repeat #e8e4dc' }} />
                  )}
                  <div style={{ padding: '14px 18px' }}>
                    {typeLabel && (
                      <span style={{
                        display: 'inline-block', marginBottom: 8, padding: '2px 10px', borderRadius: 999,
                        fontFamily: FB, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.05em', background: 'rgba(0,0,0,0.06)', color: INK_MUTED,
                      }}>
                        {typeLabel}
                      </span>
                    )}
                    <h3 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: INK, margin: '0 0 6px', lineHeight: 1.2, fontWeight: 600 }}>
                      {offer.title}
                    </h3>
                    {offer.description && (
                      <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '0 0 12px', lineHeight: 1.5 }}>
                        {offer.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {offer.point_cost !== null && offer.point_cost > 0 && (
                          <span style={{ background: ACCENT + '33', color: ACCENT_TEXT, fontFamily: FB, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999 }}>
                            {offer.point_cost + ' pts'}
                          </span>
                        )}
                        {expiry && (
                          <span style={{ background: 'rgba(0,0,0,0.05)', color: INK_MUTED, fontFamily: FB, fontSize: 12, padding: '4px 10px', borderRadius: 999 }}>
                            {expiry}
                          </span>
                        )}
                      </div>
                      {canRedeem && (
                        <a
                          href={'/' + slug + '/menu'}
                          style={{
                            background: ACCENT, color: ACCENT_TEXT,
                            padding: '9px 18px', borderRadius: 10,
                            fontFamily: FB, fontSize: 13, fontWeight: 700, textDecoration: 'none',
                            flexShrink: 0, boxShadow: '0 0 12px rgba(217,245,78,0.35)',
                          }}
                        >
                          Redeem
                        </a>
                      )}
                    </div>
                  </div>
                </GlassCard>
              )
            })}
          </>
        )}

        {/* ── Your Challenges ── */}
        {loaded && challenges.length > 0 && (
          <>
            <SectionHeader title="Your challenges" />
            {challenges.map(ch => {
              const pct = Math.min(100, ch.target_count > 0 ? Math.round((ch.progress / ch.target_count) * 100) : 0)
              const done = ch.progress >= ch.target_count
              return (
                <GlassCard key={ch.id}>
                  <div style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <h3 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, color: INK, margin: 0, lineHeight: 1.2, fontWeight: 600, flex: 1, paddingRight: 8 }}>
                        {ch.title}
                      </h3>
                      <span style={{
                        background: ACCENT + '33', color: ACCENT_TEXT, fontFamily: FB, fontSize: 12,
                        fontWeight: 700, padding: '3px 10px', borderRadius: 999, flexShrink: 0,
                      }}>
                        {'+' + ch.reward_points + ' pts'}
                      </span>
                    </div>
                    {ch.description && (
                      <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '0 0 10px', lineHeight: 1.4 }}>
                        {ch.description}
                      </p>
                    )}
                    {/* Progress bar */}
                    <div style={{ background: 'rgba(0,0,0,0.07)', borderRadius: 999, height: 6, marginBottom: 6, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 999,
                        background: done ? ACCENT : 'rgba(217,245,78,0.6)',
                        width: pct + '%',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED }}>
                        {ch.progress + ' / ' + ch.target_count}
                        {ch.expires_at ? (' · Expires ' + new Date(ch.expires_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Melbourne' })) : ''}
                      </span>
                      {done && (
                        <a
                          href={'/' + slug + '/rewards'}
                          style={{
                            background: ACCENT, color: ACCENT_TEXT,
                            padding: '7px 14px', borderRadius: 10,
                            fontFamily: FB, fontSize: 12, fontWeight: 700, textDecoration: 'none',
                            boxShadow: '0 0 10px rgba(217,245,78,0.4)',
                          }}
                        >
                          Claim reward
                        </a>
                      )}
                    </div>
                  </div>
                </GlassCard>
              )
            })}
          </>
        )}

        {/* ── Tier Perks / Reward Rules ── */}
        {loaded && rewardRules.length > 0 && (
          <>
            <SectionHeader title="How to earn points" />
            {rewardRules.map(rule => (
              <GlassCard key={rule.id} style={{ marginBottom: 8 }}>
                <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: ACCENT + '22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 16, fontWeight: 700, color: ACCENT_TEXT }}>
                      {'+' + rule.points_value}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: INK, margin: '0 0 2px' }}>
                      {rule.name}
                    </p>
                    <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: 0, lineHeight: 1.4 }}>
                      {rule.description}
                    </p>
                  </div>
                  <span style={{
                    fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: INK_MUTED, flexShrink: 0,
                    fontWeight: 700,
                  }}>
                    {'pts'}
                  </span>
                </div>
              </GlassCard>
            ))}
          </>
        )}

        {/* Not logged in notice */}
        {loaded && !customerId && (
          <div style={{
            marginTop: 24, padding: '16px 18px', borderRadius: 16,
            background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            textAlign: 'center',
          }}>
            <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: '0 0 10px' }}>
              Sign in to see your personalised challenges
            </p>
            <a
              href={'/' + slug + '/onboarding'}
              style={{ background: ACCENT, color: ACCENT_TEXT, padding: '9px 20px', borderRadius: 10, fontFamily: FB, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
            >
              Sign in
            </a>
          </div>
        )}
      </div>

      <CxTabBar slug={slug} active="offers" />
    </div>
  )
}