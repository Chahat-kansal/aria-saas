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

// ── Frosted glass padlock ──────────────────────────────────────────────────────
function PadlockIcon() {
  return (
    <div style={{
      width: 44, height: 44, borderRadius: '50%',
      background: 'rgba(255,255,255,0.68)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      flexShrink: 0,
    }}>
      <svg width="20" height="22" viewBox="0 0 20 22" fill="none" style={{ display: 'block' }}>
        <rect x="2" y="10" width="16" height="11" rx="3"
          fill="rgba(100,100,100,0.15)" stroke={INK_MUTED} strokeWidth="1.4" />
        <path d="M6 10V7a4 4 0 0 1 8 0v3"
          stroke={INK_MUTED} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="15.5" r="1.5" fill={INK_MUTED} />
      </svg>
    </div>
  )
}

// ── Reward card — glass surface ────────────────────────────────────────────────
function RewardCard({ rule, pts, slug }: { rule: RewardRule; pts: number; slug: string }) {
  const cost = Number(rule.threshold_value ?? 0)
  const canRedeem = cost > 0 && pts >= cost
  const locked = cost > 0 && pts < cost
  const redeemUrl = '/' + slug + '/loyalty/redeem?rule=' + rule.id

  return (
    <div style={{
      display: 'flex',
      borderRadius: 20,
      background: 'rgba(255,255,255,0.65)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      overflow: 'hidden',
      boxShadow: canRedeem
        ? '0 4px 24px rgba(0,0,0,0.05), 0 0 20px 2px rgba(217,245,78,0.5)'
        : '0 4px 24px rgba(0,0,0,0.05)',
      filter: locked ? 'grayscale(0.6)' : 'none',
      opacity: locked ? 0.82 : 1,
      border: canRedeem ? ('2px solid ' + ACCENT) : '1px solid rgba(0,0,0,0.05)',
      marginBottom: 14,
    }}>
      {/* Product image — left 40%, fills height */}
      <div style={{
        width: '40%', flexShrink: 0, minHeight: 155,
        background: rule.image_url
          ? ('url(' + rule.image_url + ') center/cover no-repeat #e8e4dc')
          : '#e8e4dc',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      </div>

      {/* Text content — right 60% */}
      <div style={{
        flex: 1, padding: '16px 14px',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        minHeight: 155,
      }}>
        <div>
          <p style={{
            fontFamily: FB, fontSize: 15, fontWeight: 700,
            margin: '0 0 2px', color: INK, lineHeight: 1.25,
          }}>
            {rule.name}
            <span style={{ fontFamily: FB, fontSize: 12, fontWeight: 400, color: INK_MUTED, marginLeft: 6 }}>
              {'(' + cost + 'pts)'}
            </span>
          </p>
          {locked && (
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 13, color: INK_MUTED, margin: '2px 0 4px' }}>
              Locked
            </p>
          )}
          {rule.description && (
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 13, color: INK_MUTED, margin: '4px 0 0', lineHeight: 1.45 }}>
              {rule.description}
            </p>
          )}
        </div>

        {canRedeem ? (
          <a
            href={redeemUrl}
            style={{
              display: 'block', textAlign: 'center', marginTop: 12,
              background: ACCENT, color: ACCENT_TEXT,
              borderRadius: 100, padding: '10px 0',
              fontFamily: FB, fontSize: 14, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 0 16px rgba(217,245,78,0.5), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
          >
            Redeem
          </a>
        ) : locked ? (
          <div style={{ position: 'absolute', top: '50%', right: 14, transform: 'translateY(-50%)' }}>
            <PadlockIcon />
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Challenge / visit bar — glass surface ─────────────────────────────────────
function VisitBar({ visits, target, label }: { visits: number; target: number; label?: string }) {
  const pct = target > 0 ? Math.min(1, visits / target) : 0
  const done = visits >= target
  const title = label ?? ('Visit ' + target + 'x this month – ' + visits + '/' + target)
  return (
    <div style={{
      background: 'rgba(255,255,255,0.65)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: 20,
      padding: '16px 18px',
      border: '1px solid rgba(0,0,0,0.05)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: INK, flex: 1 }}>
          {title}
        </span>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          background: done ? ACCENT : 'rgba(0,0,0,0.09)',
          borderRadius: 100, padding: '4px 10px',
          boxShadow: done ? '0 0 10px rgba(217,245,78,0.5)' : 'none',
          flexShrink: 0, marginLeft: 10,
        }}>
          {done && (
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none"
              stroke={ACCENT_TEXT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 5 4.5 8.5 11 1" />
            </svg>
          )}
          <span style={{
            fontFamily: FB, fontSize: 12, fontWeight: 700, lineHeight: 1,
            color: done ? ACCENT_TEXT : INK_MUTED,
          }}>
            {visits + '/' + target}
          </span>
        </div>
      </div>
      <div style={{ height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: (pct * 100).toFixed(1) + '%',
          background: ACCENT, borderRadius: 4, transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function RewardsClient({ slug, bizName, logoUrl: _logoUrl, rewardRules }: {
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

  // Next reward threshold → ring progress
  const sortedRules = [...rewardRules].sort((a, b) => (a.threshold_value ?? 0) - (b.threshold_value ?? 0))
  const nextThreshold = sortedRules.find(r => (r.threshold_value ?? 0) > pts)?.threshold_value ?? null
  const ptsToNext = nextThreshold !== null ? Math.max(0, nextThreshold - pts) : 0
  const ringPct = nextThreshold !== null ? Math.min(1, pts / nextThreshold) : 1

  // Ring SVG math — r=110 in 260×260 viewBox
  const R = 110
  const circumference = 2 * Math.PI * R
  const dashLen = (ringPct * circumference).toFixed(1)
  const dashGap = ((1 - ringPct) * circumference).toFixed(1)
  const ringDash = dashLen + ' ' + dashGap

  const tierLabel = rawTier === 'gold' || rawTier === 'Gold' ? 'Gold'
    : rawTier === 'silver' || rawTier === 'Silver' ? 'Silver'
    : 'Member'

  const activeChallenge = challenges.find(c => c.status === 'active') ?? null

  return (
    <div style={{
      width: '100%', maxWidth: '28rem', margin: '0 auto',
      minHeight: '100dvh',
      // cream base + subtle white sheen at top
      background: 'radial-gradient(ellipse 130% 30% at 50% 0%, rgba(255,255,255,0.44) 0%, transparent 55%), ' + BG,
      fontFamily: FB, color: INK,
    }}>
      <style>{`
        body { background: #f3efe4 }
        *, *::before, *::after { box-sizing: border-box }
        @keyframes cx-fade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
      `}</style>

      {/* ── "Rewards" title — floats above glass card ── */}
      <h1 style={{
        fontFamily: FD, fontStyle: 'italic', fontSize: 52, fontWeight: 400,
        color: INK, margin: 0, letterSpacing: '-0.01em', lineHeight: 1.05,
        textAlign: 'center',
        paddingTop: 56, paddingBottom: 0,
      }}>
        Rewards
      </h1>

      {/* ── GLASS HERO CARD ── tier pill + pts + ring arc ── */}
      <div style={{
        position: 'relative',
        margin: '24px 20px 24px',
        height: 280,
        borderRadius: 28,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.42)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.55)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
      }}>
        {/* lime radial glow — concentrated behind ring at bottom */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 90% 65% at 50% 95%, rgba(217,245,78,0.52) 0%, transparent 65%)',
        }} />

        {/* tier pill — straddles card's top edge */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', justifyContent: 'center',
          zIndex: 10,
        }}>
          {loaded && cx ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              borderRadius: 100, padding: '9px 20px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
              border: '1px solid rgba(255,255,255,0.8)',
              transform: 'translateY(-50%)',
            }}>
              <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 15, color: ACCENT_TEXT, fontWeight: 600 }}>
                {'↗ ' + tierLabel + ' tier' + (ptsToNext > 0 ? ' — ' + ptsToNext + ' pts to next reward' : ' — all rewards unlocked!')}
              </span>
            </div>
          ) : (loaded && !cx) ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              borderRadius: 100, padding: '9px 20px',
              border: '1px solid rgba(255,255,255,0.8)',
              transform: 'translateY(-50%)',
            }}>
              <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 15, color: INK_MUTED }}>
                Sign in to see your tier
              </span>
            </div>
          ) : null}
        </div>

        {/* pts label — centered in upper portion of card */}
        <div style={{
          position: 'absolute',
          top: 60, bottom: 130,
          left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2,
        }}>
          <span style={{
            fontFamily: FB, fontSize: 68, fontWeight: 800,
            color: INK, letterSpacing: '-0.03em', lineHeight: 1,
          }}>
            {pts.toLocaleString() + ' pts'}
          </span>
        </div>

        {/* ring arc — bottom: -150 so only top arc is visible, center is clipped */}
        <div style={{
          position: 'absolute',
          bottom: -150,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1,
        }}>
          <svg
            width="260" height="260" viewBox="0 0 260 260"
            style={{ display: 'block' }}
            aria-hidden="true"
          >
            {/* track */}
            <circle
              cx="130" cy="130" r={R}
              fill="none"
              stroke="rgba(0,0,0,0.10)"
              strokeWidth="6"
            />
            {/* progress arc — 12 o'clock clockwise */}
            <circle
              cx="130" cy="130" r={R}
              fill="none"
              stroke={ACCENT}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={ringDash}
              transform="rotate(-90 130 130)"
              style={{ filter: 'drop-shadow(0 0 8px rgba(217,245,78,0.85))' }}
            />
          </svg>
        </div>
      </div>

      {/* ── BODY — glass cards ── */}
      <div style={{
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom) + 24px)',
      }}>
        {/* Not-logged-in prompt */}
        {loaded && !cx && (
          <div style={{
            marginBottom: 14,
            padding: 20,
            background: 'rgba(255,255,255,0.65)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 20,
            border: '1px solid rgba(0,0,0,0.05)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
            textAlign: 'center',
          }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, margin: '0 0 14px', color: INK }}>
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

        {/* Reward cards */}
        {rewardRules.length > 0 ? (
          rewardRules.map(r => (
            <RewardCard key={r.id} rule={r} pts={pts} slug={slug} />
          ))
        ) : (
          <div style={{
            textAlign: 'center', padding: '36px 0',
            background: 'rgba(255,255,255,0.65)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 20,
            border: '1px solid rgba(0,0,0,0.05)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎁</div>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, margin: '0 0 8px', color: INK }}>
              Rewards coming soon
            </p>
            <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>
              {bizName + ' is setting up their loyalty catalog'}
            </p>
          </div>
        )}

        {/* Challenge bar */}
        {activeChallenge ? (
          <VisitBar
            visits={activeChallenge.progress}
            target={activeChallenge.target_count}
            label={activeChallenge.title}
          />
        ) : null}
      </div>

      <CxTabBar slug={slug} active="rewards" />
    </div>
  )
}