'use client'
import { CxTabBar } from '../CxTabBar'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FD = "var(--font-display,'Cormorant',Georgia,serif)"
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"

// ARIA-FIX-ASSETS-1 — the six /cx-lib/hf_2026….png fallbacks that used to live here NEVER EXISTED
// in this repo and returned 404 in production, on a customer-facing screen. Because the card paints
// them as a CSS `background: url(...)` rather than an <img>, they degraded to a flat #f0ede8 panel
// instead of a broken-image icon — quieter than it should have been, which is why it survived.
//
// Replaced with a drawn placeholder rather than substitute art: nothing to deploy, nothing to 404.
// STRUCTURED SO REAL ART NEEDS NO CODE CHANGE — rule.image_url still wins whenever it is set, and
// this is only the absent-image branch. Dropping images into the rewards data replaces these with
// no edit here.
const PLACEHOLDER_TINTS: Array<[string, string]> = [
  ['#e7e2d2', '#cfc7ae'],
  ['#dfe6d8', '#c2cfb6'],
  ['#e6ded9', '#cdbdb4'],
  ['#dde3e6', '#bcc8cf'],
  ['#e8e3dc', '#d3c8b8'],
  ['#e2e0e8', '#c6c2d3'],
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
  const imgSrc = rule.image_url          // null -> the drawn placeholder below, never a dead URL
  const redeemUrl = '/' + slug + '/loyalty/redeem?rule=' + rule.id
  const tint = PLACEHOLDER_TINTS[index % PLACEHOLDER_TINTS.length]
  const initial = (rule.name ?? '').trim().charAt(0).toUpperCase() || '★'

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
      {imgSrc ? (
        <div style={{
          width: '40%', flexShrink: 0, alignSelf: 'stretch',
          background: 'url(' + imgSrc + ') center/cover no-repeat #f0ede8',
          minHeight: 150,
        }} />
      ) : (
        // Drawn, not fetched. A soft diagonal wash in the CX palette with the reward's initial —
        // reads as intentional artwork rather than a hole where an image failed.
        <div
          aria-hidden="true"
          style={{
            width: '40%', flexShrink: 0, alignSelf: 'stretch', minHeight: 150,
            background: 'linear-gradient(145deg, ' + tint[0] + ' 0%, ' + tint[1] + ' 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
          }}
        >
          <span style={{
            fontFamily: FD, fontStyle: 'italic', fontSize: 46, lineHeight: 1,
            color: 'rgba(10,10,10,0.20)', userSelect: 'none',
          }}>
            {initial}
          </span>
        </div>
      )}
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

export function RewardsClient({ slug, bizName, rewardRules, isSignedIn, pts, tier: rawTierProp, challenges, programEnabled = true }: {
  slug: string
  bizName: string
  logoUrl: string | null
  rewardRules: RewardRule[]
  isSignedIn: boolean
  pts: number
  tier: string | null
  customerId: string | null
  challenges: Challenge[]
  programEnabled?: boolean
}) {
  const rawTier = rawTierProp ?? 'Member'

  const sortedRules = [...rewardRules].sort((a, b) => (a.threshold_value ?? 0) - (b.threshold_value ?? 0))
  const nextRule = sortedRules.find(r => (r.threshold_value ?? 0) > pts)
  const nextCost = nextRule?.threshold_value ?? null
  const ptsToNext = nextCost !== null ? Math.max(0, nextCost - pts) : 0
  const ringPct = nextCost !== null && nextCost > 0 ? Math.min(1, pts / nextCost) : (rewardRules.length > 0 ? 1 : 0)

  const tierLabel = /gold/i.test(rawTier) ? 'Gold'
    : /silver/i.test(rawTier) ? 'Silver'
    : rawTier ?? 'Member'

  const activeChallenges = challenges.filter(c => c.status === 'active')

  // Ring math — r=90 in 200×200 SVG, center 100,100
  const R = 90
  const circumference = 2 * Math.PI * R
  const dashOffset = (circumference * (1 - ringPct)).toFixed(2)

  const pillText = !isSignedIn ? 'Sign in to see your rewards'
    : ptsToNext > 0
      ? ('↗ ' + tierLabel + ' tier — ' + ptsToNext + ' pts to next reward')
      : ('↗ ' + tierLabel + ' tier — all rewards unlocked!')

  // Graceful state: loyalty disabled by owner
  if (!programEnabled) {
    return (
      <div style={{ minHeight: '100dvh', background: BG }}>
        <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>
        <div style={{ maxWidth: '28rem', margin: '0 auto', minHeight: '100dvh', background: BG, fontFamily: FB, color: INK }}>
          <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 40, fontWeight: 400, color: INK, margin: 0, textAlign: 'center', lineHeight: 1.1, paddingTop: 32 }}>
            Rewards
          </h1>
          <div style={{ margin: '32px 12px 0', padding: '32px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.60)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: INK, margin: '0 0 8px' }}>
              Loyalty not active
            </p>
            <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>
              {bizName + ' has paused their loyalty program. Check back soon!'}
            </p>
          </div>
          <div style={{ height: 'calc(96px + env(safe-area-inset-bottom) + 24px)' }} />
          <CxTabBar slug={slug} active="rewards" />
        </div>
      </div>
    )
  }

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

        {/* ══ 1. FLOATING HEADER ══════════════════════════════════════════ */}

        {/* "Rewards" */}
        <h1 style={{
          fontFamily: FD, fontStyle: 'italic', fontSize: 40, fontWeight: 400,
          color: INK, margin: 0, textAlign: 'center', lineHeight: 1.1,
          paddingTop: 32,
        }}>
          Rewards
        </h1>

        {/* Compact tier pill */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            background: 'rgba(255,255,255,0.70)',
            borderRadius: 9999,
            padding: '8px 20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}>
            <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 14, color: INK, whiteSpace: 'nowrap' }}>
              {pillText}
            </span>
          </div>
        </div>

        {/* Ring — 200px, full circle visible, glow bleeds freely into cream bg */}
        <div style={{ width: 200, height: 200, margin: '20px auto 0', position: 'relative' }}>
          {/* Glow — larger than ring, bleeds beyond container edges */}
          <div style={{
            position: 'absolute', width: 340, height: 340,
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(217,245,78,0.30) 0%, transparent 70%)',
            filter: 'blur(40px)',
            zIndex: 0,
            pointerEvents: 'none',
          }} />
          {/* SVG ring — 200×200, R=90 center 100,100 */}
          <svg
            width="200" height="200" viewBox="0 0 200 200"
            style={{ position: 'absolute', top: 0, left: 0, display: 'block', zIndex: 1 }}
            aria-hidden="true"
          >
            <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(10,10,10,0.12)" strokeWidth="7" />
            <circle
              cx="100" cy="100" r={R}
              fill="none"
              stroke={ACCENT}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference.toFixed(2)}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 100 100)"
            />
          </svg>
          {/* "{pts} pts" — absolutely centered inside ring */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2,
          }}>
            <span style={{
              fontFamily: FB, fontSize: 44, fontWeight: 800,
              color: INK, letterSpacing: '-0.03em', lineHeight: 1,
              whiteSpace: 'nowrap',
            }}>
              {pts.toLocaleString() + ' pts'}
            </span>
          </div>
        </div>

        {/* ══ 2. REWARD CARDS ══════════════════════════════════════════════ */}
        <div style={{ marginTop: 20, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {!isSignedIn && (
            <div style={{
              padding: '20px', borderRadius: 18, textAlign: 'center',
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.60)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            }}>
              <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, color: INK, margin: '0 0 14px' }}>
                Sign in to see your rewards
              </p>
              <a href={'/' + slug + '/onboarding'} style={{
                display: 'inline-block', background: ACCENT, color: ACCENT_TEXT,
                borderRadius: 100, padding: '10px 24px',
                fontFamily: FB, fontSize: 14, fontWeight: 700, textDecoration: 'none',
              }}>
                Sign in
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