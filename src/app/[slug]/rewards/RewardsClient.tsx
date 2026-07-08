'use client'
import { useState, useEffect } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FD = "var(--font-display,'Cormorant',Georgia,serif)"
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"

const FALLBACKS = [
  '/cx-lib/hf_20260706_120845_1d9ab7d2-fd10-4eda-aab3-38db43c8f802.png',
  '/cx-lib/hf_20260706_121030_f6cb2f65-30f9-4367-871e-114e0d655745.png',
  '/cx-lib/hf_20260706_121035_5e6edb8e-e6d8-4b63-a03a-8cf676871b68.png',
  '/cx-lib/hf_20260706_121049_6a534cc1-9a81-44eb-a677-60dc6727552a.png',
  '/cx-lib/hf_20260706_121226_b5c2300a-9c9f-4db4-8761-7c8171e3dec7.png',
  '/cx-lib/hf_20260706_121303_aa5a43bd-6137-4d0e-bbd7-2d9bf32ec275.png',
]

export interface RewardRule {
  id: string
  name: string
  description: string | null
  threshold_value: number | null
  reward_type: string | null
  image_url: string | null
  is_active: boolean
}

interface Challenge {
  id: string
  title: string
  description: string | null
  target_count: number
  progress: number
  reward_points: number
  status: string
  expires_at: string | null
}

interface EarnTxn {
  id: string
  type: string
  points_delta: number
  created_at: string
}

interface CxData {
  found: boolean
  customer_id?: string
  name?: string
  points_balance?: number
  loyalty_tier?: string | null
  visit_count?: number
  challenges?: Challenge[]
  recent_txns?: EarnTxn[]
}

function PadlockIcon() {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: '50%',
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.72)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width="17" height="19" viewBox="0 0 17 19" fill="none" aria-hidden="true">
        <rect x="1.5" y="8.5" width="14" height="10" rx="2.5"
          fill="rgba(10,10,10,0.05)" stroke={INK} strokeWidth="1.3" />
        <path d="M4.5 8.5V6A4 4 0 0 1 12.5 6v2.5"
          stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8.5" cy="13.5" r="1.5" fill={INK} />
      </svg>
    </div>
  )
}

function RewardCard({ rule, pts, slug, index }: {
  rule: RewardRule
  pts: number
  slug: string
  index: number
}) {
  const cost = Number(rule.threshold_value ?? 0)
  const canRedeem = cost > 0 && pts >= cost
  const locked = cost > 0 && pts < cost
  const imgSrc = rule.image_url ?? FALLBACKS[index % FALLBACKS.length]
  const redeemUrl = '/' + slug + '/loyalty/redeem?rule=' + rule.id

  return (
    <div style={{
      display: 'flex',
      borderRadius: 18,
      overflow: 'hidden',
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.60)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      filter: locked ? 'grayscale(0.6)' : 'none',
      opacity: locked ? 0.80 : 1,
    }}>
      <div style={{
        width: '40%', flexShrink: 0, alignSelf: 'stretch',
        background: 'url(' + imgSrc + ') center/cover no-repeat #f0ede8',
        minHeight: 150,
      }} />
      <div style={{
        flex: 1, minWidth: 0, padding: '15px 14px 14px 14px',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
        minHeight: 150,
      }}>
        <p style={{ fontFamily: FB, fontSize: 16, fontWeight: 700, color: INK, margin: '0 0 3px', lineHeight: 1.2, paddingRight: locked ? 48 : 0 }}>
          {rule.name}
          <span style={{ fontFamily: FB, fontSize: 14, fontWeight: 400, color: INK_MUTED, marginLeft: 4 }}>
            {'(' + cost + 'pts)'}
          </span>
        </p>
        {locked && (
          <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 14, color: '#8a8a82', margin: '2px 0 0' }}>
            Locked
          </p>
        )}
        {rule.description && (
          <p style={{
            fontFamily: FD, fontStyle: 'italic', fontSize: 15, color: '#55554e',
            margin: '5px 0 0', lineHeight: 1.45,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {rule.description}
          </p>
        )}
        {canRedeem && (
          <a href={redeemUrl} style={{
            display: 'block', textAlign: 'center', marginTop: 12,
            background: ACCENT, color: ACCENT_TEXT,
            borderRadius: 100, padding: '11px 0',
            fontFamily: FB, fontSize: 15, fontWeight: 700, textDecoration: 'none',
            boxShadow: '0 0 18px rgba(217,245,78,0.50)',
          }}>
            Redeem
          </a>
        )}
        {locked && (
          <div style={{ position: 'absolute', bottom: 12, right: 12 }}>
            <PadlockIcon />
          </div>
        )}
      </div>
    </div>
  )
}

function ChallengeCard({ ch }: { ch: Challenge }) {
  const pct = ch.target_count > 0 ? Math.min(1, ch.progress / ch.target_count) : 0
  const done = ch.progress >= ch.target_count
  return (
    <div style={{
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,0.60)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <p style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, color: INK, margin: 0, flex: 1, lineHeight: 1.3 }}>
          {ch.title + ' — ' + ch.progress + '/' + ch.target_count}
        </p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: ACCENT, color: ACCENT_TEXT,
          borderRadius: 100, padding: '4px 10px',
          flexShrink: 0,
          boxShadow: done ? '0 0 10px rgba(217,245,78,0.5)' : 'none',
        }}>
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden="true">
            <polyline points="1 4.5 3.9 7.5 10 1"
              stroke={ACCENT_TEXT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontFamily: FB, fontSize: 12, fontWeight: 700, color: ACCENT_TEXT }}>
            {ch.progress + '/' + ch.target_count}
          </span>
        </div>
      </div>
      <div style={{ height: 7, background: 'rgba(10,10,10,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4,
          background: ACCENT,
          width: (pct * 100).toFixed(1) + '%',
          transition: 'width 0.5s ease',
          boxShadow: done ? '0 0 8px rgba(217,245,78,0.6)' : 'none',
        }} />
      </div>
    </div>
  )
}

export function RewardsClient({ slug, bizName, rewardRules }: {
  slug: string
  bizName: string
  logoUrl: string | null
  rewardRules: RewardRule[]
}) {
  const [cx, setCx] = useState<CxData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('aria_cx_' + slug)
      if (saved) {
        const { phone } = JSON.parse(saved) as { phone?: string }
        if (phone) {
          fetch('/api/public/cx/' + slug + '/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone }),
          })
            .then(r => r.json())
            .then((data: CxData) => { setCx(data.found ? data : null); setLoaded(true) })
            .catch(() => setLoaded(true))
          return
        }
      }
    } catch { /* no localStorage */ }
    setLoaded(true)
  }, [slug])

  const pts = cx?.points_balance ?? 0
  const rawTier = cx?.loyalty_tier ?? 'Member'
  const challenges = (cx?.challenges ?? []) as Challenge[]

  const sortedRules = [...rewardRules].sort((a, b) => (a.threshold_value ?? 0) - (b.threshold_value ?? 0))
  const nextRule = sortedRules.find(r => (r.threshold_value ?? 0) > pts)
  const nextCost = nextRule?.threshold_value ?? null
  const ptsToNext = nextCost !== null ? Math.max(0, nextCost - pts) : 0
  const ringPct = nextCost !== null && nextCost > 0 ? Math.min(1, pts / nextCost) : (rewardRules.length > 0 ? 1 : 0)

  const tierLabel = /gold/i.test(rawTier) ? 'Gold'
    : /silver/i.test(rawTier) ? 'Silver'
    : rawTier ?? 'Member'

  const activeChallenges = challenges.filter(c => c.status === 'active')

  // Ring math — r=130 in 280×280 SVG, center 140,140
  const R = 130
  const circumference = 2 * Math.PI * R
  const dashOffset = (circumference * (1 - ringPct)).toFixed(2)

  const pillText = !loaded ? ' '
    : !cx ? 'Sign in to see your rewards'
    : ptsToNext > 0
      ? ('↗ ' + tierLabel + ' tier — ' + ptsToNext + ' pts to next reward')
      : ('↗ ' + tierLabel + ' tier — all rewards unlocked!')

  return (
    // ── OUTER: full-viewport background, content centered ──────────────────
    <div style={{ minHeight: '100dvh', background: BG }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>

      {/* ── INNER: max-w-md centered column ─────────────────────────────── */}
      <div style={{
        maxWidth: '28rem',
        margin: '0 auto',
        minHeight: '100dvh',
        background: 'radial-gradient(ellipse 120% 28% at 50% 0%, rgba(255,255,255,0.40) 0%, transparent 55%), ' + BG,
        fontFamily: FB,
        color: INK,
      }}>

        {/* ══ 1. HEADER GLASS CARD ════════════════════════════════════════ */}
        <div style={{
          margin: '8px 12px 0',
          borderRadius: 32,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.35) 100%)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.60)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          position: 'relative',
          paddingBottom: 64,
        }}>

          {/* Lime wash — absolute bottom half */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
            background: 'linear-gradient(to top, rgba(217,245,78,0.28) 0%, transparent 100%)',
            pointerEvents: 'none', zIndex: 0,
          }} />

          {/* Ring — absolute, anchored to right edge, clips right+bottom */}
          <svg
            width="280" height="280" viewBox="0 0 280 280"
            style={{ position: 'absolute', right: -60, top: 120, zIndex: 0, display: 'block' }}
            aria-hidden="true"
          >
            {/* Track — white/60 */}
            <circle
              cx="140" cy="140" r={R}
              fill="none"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="10"
            />
            {/* Progress — lime, glow, start 12 o'clock */}
            <circle
              cx="140" cy="140" r={R}
              fill="none"
              stroke={ACCENT}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference.toFixed(2)}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 140 140)"
              style={{ filter: 'drop-shadow(0 0 6px rgba(217,245,78,0.5))' }}
            />
          </svg>

          {/* "Rewards" — Cormorant italic, z above ring */}
          <h1 style={{
            fontFamily: FD, fontStyle: 'italic', fontSize: 64, fontWeight: 400,
            color: INK, margin: 0, textAlign: 'center', lineHeight: 1.05,
            paddingTop: 44,
            position: 'relative', zIndex: 1,
          }}>
            Rewards
          </h1>

          {/* Wide glass tier bar */}
          <div style={{
            width: '92%', margin: '12px auto 0',
            borderRadius: 14,
            background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.70)',
            padding: '9px 20px',
            textAlign: 'center',
            position: 'relative', zIndex: 1,
          }}>
            <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 15, color: INK, lineHeight: 1.2 }}>
              {pillText}
            </span>
          </div>

          {/* "{pts} pts" — normal flow, mt-4, z above ring, overlaps ring's left arc */}
          <div style={{ marginTop: 16, textAlign: 'center', position: 'relative', zIndex: 1 }}>
            <span style={{
              fontFamily: FB, fontSize: 60, fontWeight: 800,
              color: INK, letterSpacing: '-0.03em', lineHeight: 1,
              whiteSpace: 'nowrap',
            }}>
              {pts.toLocaleString() + ' pts'}
            </span>
          </div>

        </div>
        {/* END HEADER CARD */}

        {/* ══ 2. REWARD CARDS ══════════════════════════════════════════════ */}
        <div style={{ marginTop: 20, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {loaded && !cx && (
            <div style={{
              padding: '20px', borderRadius: 18, textAlign: 'center',
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.60)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            }}>
              <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, color: INK, margin: '0 0 14px' }}>
                Check your points
              </p>
              <a href={'/' + slug} style={{
                display: 'inline-block', background: ACCENT, color: ACCENT_TEXT,
                borderRadius: 100, padding: '10px 24px',
                fontFamily: FB, fontSize: 14, fontWeight: 700, textDecoration: 'none',
              }}>
                Sign in on Home
              </a>
            </div>
          )}

          {rewardRules.length > 0 ? (
            rewardRules.map((r, i) => (
              <RewardCard key={r.id} rule={r} pts={pts} slug={slug} index={i} />
            ))
          ) : (
            <div style={{
              padding: '36px 20px', borderRadius: 18, textAlign: 'center',
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.60)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎁</div>
              <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, color: INK, margin: '0 0 8px' }}>
                Rewards coming soon
              </p>
              <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>
                {bizName + ' is setting up their loyalty catalog'}
              </p>
            </div>
          )}
        </div>

        {/* ══ 3. CHALLENGE CARDS ═══════════════════════════════════════════ */}
        {activeChallenges.length > 0 && (
          <div style={{ marginTop: 14, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeChallenges.map(ch => (
              <ChallengeCard key={ch.id} ch={ch} />
            ))}
          </div>
        )}

        {/* ══ 4. BOTTOM SPACER = nav + safe-area + 24px ═══════════════════ */}
        <div style={{ height: 'calc(96px + env(safe-area-inset-bottom) + 24px)' }} />

        {/* ══ 5. TAB BAR ══════════════════════════════════════════════════ */}
        <CxTabBar slug={slug} active="rewards" />
      </div>
    </div>
  )
}