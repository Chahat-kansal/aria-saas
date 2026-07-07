'use client'
import { useState, useEffect } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const FD = "var(--font-display,'Cormorant',Georgia,serif)"
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"

// cx-lib food image fallbacks — cycled by card index, never a grey box
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

// ── Padlock icon — frosted circle, ink outline SVG ─────────────────────────────
function PadlockIcon() {
  return (
    <div style={{
      width: 44, height: 44, borderRadius: '50%',
      background: 'rgba(255,255,255,0.70)',
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.70)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width="18" height="20" viewBox="0 0 18 20" fill="none" aria-hidden="true">
        <rect x="2" y="9" width="14" height="10" rx="2.5"
          fill="rgba(10,10,10,0.06)" stroke={INK} strokeWidth="1.3" />
        <path d="M5 9V6.5a4 4 0 0 1 8 0V9"
          stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="14" r="1.5" fill={INK} />
      </svg>
    </div>
  )
}

// ── Reward card ────────────────────────────────────────────────────────────────
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
      background: 'rgba(255,255,255,0.70)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.60)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      filter: locked ? 'grayscale(0.55)' : 'none',
      opacity: locked ? 0.85 : 1,
    }}>
      {/* Food image — 38%, full height, object-cover */}
      <div style={{
        width: '38%', flexShrink: 0, alignSelf: 'stretch',
        background: 'url(' + imgSrc + ') center/cover no-repeat',
        minHeight: 148,
      }} />

      {/* Text pane — right 62%, position relative for padlock */}
      <div style={{
        flex: 1, padding: '16px 16px 16px 14px',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
        minHeight: 148,
      }}>
        {/* Title + cost */}
        <p style={{ fontFamily: FB, fontSize: 17, fontWeight: 700, color: INK, margin: '0 0 4px', lineHeight: 1.2, paddingRight: locked ? 52 : 0 }}>
          {rule.name}
          <span style={{ fontFamily: FB, fontSize: 15, fontWeight: 400, color: '#7a7a72', marginLeft: 6 }}>
            {'(' + cost + 'pts)'}
          </span>
        </p>

        {/* Locked label */}
        {locked && (
          <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 15, color: '#8a8a82', margin: '2px 0 0' }}>
            Locked
          </p>
        )}

        {/* Description */}
        {rule.description && (
          <p style={{
            fontFamily: FD, fontStyle: 'italic', fontSize: 15, color: '#55554e',
            margin: '4px 0 0', lineHeight: 1.45,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {rule.description}
          </p>
        )}

        {/* Redeem button */}
        {canRedeem && (
          <a
            href={redeemUrl}
            style={{
              display: 'block', textAlign: 'center', marginTop: 14,
              background: ACCENT, color: ACCENT_TEXT,
              borderRadius: 100, padding: '12px 0',
              fontFamily: FB, fontSize: 16, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 0 20px rgba(217,245,78,0.45)',
            }}
          >
            Redeem
          </a>
        )}

        {/* Padlock — absolute bottom-right of text pane only */}
        {locked && (
          <div style={{ position: 'absolute', bottom: 12, right: 12 }}>
            <PadlockIcon />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Challenge card ─────────────────────────────────────────────────────────────
function ChallengeCard({ ch }: { ch: Challenge }) {
  const pct = ch.target_count > 0 ? Math.min(1, ch.progress / ch.target_count) : 0
  const done = ch.progress >= ch.target_count
  return (
    <div style={{
      background: 'rgba(255,255,255,0.70)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,0.60)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      padding: 16,
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <p style={{ fontFamily: FB, fontSize: 16, fontWeight: 700, color: INK, margin: 0, flex: 1 }}>
          {ch.title}
        </p>
        {/* Lime chip with optional check */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: ACCENT, color: ACCENT_TEXT,
          borderRadius: 100, padding: '4px 12px',
          flexShrink: 0,
          boxShadow: done ? '0 0 10px rgba(217,245,78,0.5)' : 'none',
        }}>
          {done && (
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none" aria-hidden="true">
              <polyline points="1 5 4.5 8.5 11 1"
                stroke={ACCENT_TEXT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 700 }}>
            {ch.progress + '/' + ch.target_count}
          </span>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ height: 8, background: 'rgba(10,10,10,0.08)', borderRadius: 4, overflow: 'hidden', marginTop: 12 }}>
        <div style={{
          height: '100%', borderRadius: 4,
          background: ACCENT,
          width: (pct * 100).toFixed(1) + '%',
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function RewardsClient({ slug, bizName, rewardRules }: {
  slug: string
  bizName: string
  logoUrl: string | null
  rewardRules: RewardRule[]
}) {
  const [cx, setCx] = useState<CxData | null>(null)
  const [loaded, setLoaded] = useState(false)

  // ── DATA HOOKS (untouched) ─────────────────────────────────────────────────
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

  const activeChallenge = challenges.find(c => c.status === 'active') ?? null

  // ── Ring math — r=118, dashoffset technique ────────────────────────────────
  const R = 118
  const circumference = 2 * Math.PI * R
  const dashOffset = (circumference * (1 - ringPct)).toFixed(2)

  // ── Tier pill label ────────────────────────────────────────────────────────
  const pillText = !loaded ? ''
    : !cx ? 'Sign in to see your tier'
    : ptsToNext > 0
      ? ('↗ ' + tierLabel + ' tier — ' + ptsToNext + ' pts to next reward')
      : ('↗ ' + tierLabel + ' tier — all rewards unlocked!')

  return (
    <div style={{
      width: '100%', maxWidth: '28rem', margin: '0 auto',
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse 120% 28% at 50% 0%, rgba(255,255,255,0.40) 0%, transparent 55%), ' + BG,
      fontFamily: FB, color: INK,
    }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box }
        body { background: ${BG} }
      `}</style>

      {/* ══ 1. HEADER GLASS CARD — all-corner rounded, floats mx-3 mt-2 ════════ */}
      <div style={{
        margin: '8px 12px 0',
        borderRadius: 32,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.35) 100%)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.60)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        paddingBottom: 40,
        minHeight: 380,
        position: 'relative',
      }}>

        {/* Lime wash — absolute bottom half of card */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
          background: 'linear-gradient(to top, rgba(217,245,78,0.35) 0%, transparent 100%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Oversize ring — absolute, centered-right, clipped by overflow-hidden */}
        <svg
          width="300" height="300" viewBox="0 0 300 300"
          style={{
            position: 'absolute', left: '50%', transform: 'translateX(-35%)', top: 150,
            zIndex: 0, display: 'block', overflow: 'visible',
          }}
          aria-hidden="true"
        >
          <circle cx="150" cy="150" r={R}
            fill="none"
            stroke="rgba(255,255,255,0.50)"
            strokeWidth="32"
          />
          <circle cx="150" cy="150" r={R}
            fill="none"
            stroke={ACCENT}
            strokeWidth="32"
            strokeLinecap="round"
            strokeDasharray={circumference.toFixed(2)}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 150 150)"
            style={{ filter: 'drop-shadow(0 0 12px rgba(217,245,78,0.80))' }}
          />
        </svg>

        {/* "Rewards" title — normal flow, z-1 */}
        <h1 style={{
          fontFamily: FD, fontStyle: 'italic', fontSize: 48, fontWeight: 500,
          color: INK, margin: 0, textAlign: 'center', lineHeight: 1.05,
          paddingTop: 32,
          position: 'relative', zIndex: 1,
        }}>
          Rewards
        </h1>

        {/* Wide tier bar — 92% width glass bar */}
        {loaded && pillText ? (
          <div style={{
            width: '92%', margin: '12px auto 0',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.70)',
            padding: '10px 0',
            textAlign: 'center',
            position: 'relative', zIndex: 1,
          }}>
            <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 15, color: INK, lineHeight: 1.2 }}>
              {pillText}
            </span>
          </div>
        ) : (
          <div style={{ height: 40, marginTop: 12 }} />
        )}

        {/* pts — normal flow, sits over ring's left arc */}
        <div style={{ marginTop: 24, textAlign: 'center', position: 'relative', zIndex: 2 }}>
          <span style={{
            fontFamily: FB, fontSize: 56, fontWeight: 800,
            color: INK, letterSpacing: '-0.03em', lineHeight: 1,
            whiteSpace: 'nowrap',
          }}>
            {pts.toLocaleString() + ' pts'}
          </span>
        </div>

      </div>
      {/* END HEADER CARD */}

      {/* ══ 2. REWARD CARDS — mt-6 px-4 space-y-4 ══════════════════════════ */}
      <div style={{ marginTop: 24, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Not-logged-in prompt */}
        {loaded && !cx && (
          <div style={{
            padding: 20, borderRadius: 18,
            background: 'rgba(255,255,255,0.70)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.60)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            textAlign: 'center',
          }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, color: INK, margin: '0 0 14px' }}>
              Check your points
            </p>
            <a
              href={'/' + slug}
              style={{
                display: 'inline-block', background: ACCENT, color: ACCENT_TEXT,
                borderRadius: 100, padding: '10px 24px',
                fontFamily: FB, fontSize: 14, fontWeight: 700, textDecoration: 'none',
              }}
            >
              Sign in on Home
            </a>
          </div>
        )}

        {/* Reward cards */}
        {rewardRules.length > 0 ? (
          rewardRules.map((r, i) => (
            <RewardCard key={r.id} rule={r} pts={pts} slug={slug} index={i} />
          ))
        ) : (
          <div style={{
            padding: '36px 20px', borderRadius: 18, textAlign: 'center',
            background: 'rgba(255,255,255,0.70)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.60)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎁</div>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, color: INK, margin: '0 0 8px' }}>
              Rewards coming soon
            </p>
            <p style={{ fontFamily: FB, fontSize: 14, color: '#7a7a72', margin: 0 }}>
              {bizName + ' is setting up their loyalty catalog'}
            </p>
          </div>
        )}
      </div>

      {/* ══ 3. CHALLENGE CARD ════════════════════════════════════════════════ */}
      {activeChallenge && (
        <div style={{ marginTop: 16, padding: '0 16px' }}>
          <ChallengeCard ch={activeChallenge} />
        </div>
      )}

      {/* ══ 4. BOTTOM SPACER ═════════════════════════════════════════════════ */}
      <div style={{ height: 'calc(96px + env(safe-area-inset-bottom))' }} />

      {/* ══ 5. TAB BAR ═══════════════════════════════════════════════════════ */}
      <CxTabBar slug={slug} active="rewards" />
    </div>
  )
}