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

// ── Frosted glass padlock — SVG icon, not emoji ────────────────────────────
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

// ── Reward card — real product photo left, content right ───────────────────
function RewardCard({ rule, pts, slug }: { rule: RewardRule; pts: number; slug: string }) {
  const cost = Number(rule.threshold_value ?? 0)
  const canRedeem = cost > 0 && pts >= cost
  const locked = cost > 0 && pts < cost
  const redeemUrl = '/' + slug + '/loyalty/redeem?rule=' + rule.id

  return (
    <div style={{
      display: 'flex',
      borderRadius: 20,
      background: '#fff',
      overflow: 'hidden',
      boxShadow: canRedeem
        ? '0 2px 16px rgba(0,0,0,0.09), 0 0 20px 2px rgba(217,245,78,0.5)'
        : '0 2px 14px rgba(0,0,0,0.07)',
      filter: locked ? 'grayscale(0.6)' : 'none',
      opacity: locked ? 0.82 : 1,
      border: canRedeem ? ('2px solid ' + ACCENT) : '2px solid transparent',
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

// ── Challenge / visit bar ──────────────────────────────────────────────────
function VisitBar({ visits, target, label }: { visits: number; target: number; label?: string }) {
  const pct = target > 0 ? Math.min(1, visits / target) : 0
  const done = visits >= target
  const title = label ?? ('Visit ' + target + 'x this month – ' + visits + '/' + target)
  return (
    <div style={{
      background: '#fff', borderRadius: 20,
      padding: '16px 18px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 14,
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
          height: '100%', width: (pct * 100).toFixed(1) + '%',
          background: ACCENT, borderRadius: 4, transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
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
    <div style={{ width: '100%', maxWidth: '28rem', margin: '0 auto', minHeight: '100dvh', background: BG, fontFamily: FB, color: INK }}>
      <style>{`
        body { background: #f3efe4 }
        *, *::before, *::after { box-sizing: border-box }
        @keyframes cx-fade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
      `}</style>

      {/* ── HEADER — lime radial gradient, progress ring hero ── */}
      <div style={{
        background: 'radial-gradient(ellipse 90% 65% at 50% 50%, rgba(217,245,78,0.5) 0%, rgba(217,245,78,0.2) 50%, transparent 75%), ' + BG,
        paddingTop: 56,
        paddingBottom: 24,
        textAlign: 'center',
      }}>
        {/* "Rewards" headline */}
        <h1 style={{
          fontFamily: FD, fontStyle: 'italic', fontSize: 52, fontWeight: 400,
          color: INK, margin: '0 0 12px', letterSpacing: '-0.01em', lineHeight: 1.05,
        }}>
          Rewards
        </h1>

        {/* Tier pill — glass, shows when logged in */}
        {loaded && cx ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              background: 'rgba(255,255,255,0.6)',
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              borderRadius: 100, padding: '8px 20px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
              border: '1px solid rgba(255,255,255,0.7)',
            }}>
              <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 15, color: ACCENT_TEXT, fontWeight: 600 }}>
                {'↗ ' + tierLabel + ' tier' + (ptsToNext > 0 ? ' — ' + ptsToNext + ' pts to next reward' : ' — all rewards unlocked!')}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ height: 40 }} />
        )}

        {/* Progress ring + pts text */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: 260, height: 260 }}>
            <svg
              width="260" height="260" viewBox="0 0 260 260"
              style={{ position: 'absolute', inset: 0, display: 'block' }}
              aria-hidden="true"
            >
              {/* Track */}
              <circle
                cx="130" cy="130" r={R}
                fill="none"
                stroke="rgba(0,0,0,0.10)"
                strokeWidth="6"
              />
              {/* Progress arc — from 12 o'clock clockwise */}
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
            {/* Centered pts label */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontFamily: FB, fontSize: 68, fontWeight: 800,
                color: INK, letterSpacing: '-0.03em', lineHeight: 1,
              }}>
                {pts.toLocaleString() + ' pts'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BODY — reward cards + challenge bar ── */}
      <div style={{
        paddingTop: 8,
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom) + 24px)',
      }}>
        {/* Not logged in prompt */}
        {loaded && !cx && (
          <div style={{ marginBottom: 20, padding: '20px', background: '#fff', borderRadius: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, margin: '0 0 14px', color: INK }}>
              Check your points
            </p>
            <a href={'/' + slug} style={{ display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '10px 24px', fontFamily: FB, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
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
          <div style={{ textAlign: 'center', padding: '36px 0', background: '#fff', borderRadius: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎁</div>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, margin: '0 0 8px', color: INK }}>
              Rewards coming soon
            </p>
            <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>
              {bizName + ' is setting up their loyalty catalog'}
            </p>
          </div>
        )}

        {/* Challenge bar — challenges data first, fallback to inferred visit count */}
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