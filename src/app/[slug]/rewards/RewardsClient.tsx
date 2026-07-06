'use client'
import { useState, useEffect } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const CARD_DARK = '#111111'
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

// Horseshoe arc progress ring — opens at bottom
function PointsArc({ pts, threshold }: { pts: number; threshold: number | null }) {
  const R = 88
  const cx = 110
  const cy = 110
  // Arc from 210deg to 330deg (clockwise) = 300deg sweep
  const startAngle = 210
  const sweepDeg = 300
  const toRad = (d: number) => (d * Math.PI) / 180
  const pct = threshold && threshold > 0 ? Math.min(1, pts / threshold) : (pts > 0 ? 0.2 : 0.02)

  function polarToXY(angleDeg: number) {
    const a = toRad(angleDeg)
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }
  }

  const s = polarToXY(startAngle)
  const e = polarToXY(startAngle + sweepDeg)
  const fEnd = polarToXY(startAngle + sweepDeg * pct)

  const trackD = 'M ' + s.x.toFixed(2) + ' ' + s.y.toFixed(2) + ' A ' + R + ' ' + R + ' 0 1 1 ' + e.x.toFixed(2) + ' ' + e.y.toFixed(2)
  const fillD = pct > 0.01
    ? ('M ' + s.x.toFixed(2) + ' ' + s.y.toFixed(2) + ' A ' + R + ' ' + R + ' 0 ' + (sweepDeg * pct > 180 ? '1' : '0') + ' 1 ' + fEnd.x.toFixed(2) + ' ' + fEnd.y.toFixed(2))
    : ''

  return (
    <svg width={220} height={145} viewBox={'0 0 220 145'} style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 0 8px rgba(217,245,78,0.6))' }}>
      <path d={trackD} fill="none" stroke="#e6e2d7" strokeWidth={10} strokeLinecap="round" />
      {fillD && (
        <path d={fillD} fill="none" stroke={ACCENT} strokeWidth={10} strokeLinecap="round" />
      )}
    </svg>
  )
}

function RewardCard({ rule, pts, slug }: { rule: RewardRule; pts: number; slug: string }) {
  const cost = Number(rule.threshold_value ?? 0)
  const canRedeem = cost > 0 && pts >= cost
  const locked = cost > 0 && pts < cost
  const need = cost - pts
  const redeemUrl = '/' + slug + '/loyalty/redeem?rule=' + rule.id

  return (
    <div style={{
      display: 'flex', borderRadius: 20, background: '#fff', overflow: 'hidden',
      boxShadow: canRedeem
        ? ('0 2px 16px rgba(0,0,0,0.09), 0 0 20px 2px rgba(217,245,78,0.5)')
        : '0 2px 16px rgba(0,0,0,0.09)',
      opacity: locked ? 0.72 : 1,
      border: canRedeem ? ('2px solid ' + ACCENT) : '2px solid transparent',
      marginBottom: 14,
    }}>
      {/* Product image — left 42% */}
      <div style={{
        width: '42%', flexShrink: 0, minHeight: 160, position: 'relative',
        background: rule.image_url
          ? ('url(' + rule.image_url + ') center/cover no-repeat #f3f4f6')
          : '#f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36,
      }}>
        {!rule.image_url && '☕'}
        {locked && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 32 }}>🔒</span>
          </div>
        )}
      </div>

      {/* Text — right 58% */}
      <div style={{ flex: 1, padding: '16px 16px 16px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, margin: '0 0 3px', color: INK, lineHeight: 1.2 }}>
            {rule.name}
            <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 400, color: INK_MUTED, marginLeft: 5 }}>
              {'(' + cost + 'pts)'}
            </span>
          </p>
          {rule.description && (
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 13, color: INK_MUTED, margin: '0 0 12px', lineHeight: 1.4 }}>
              {rule.description}
            </p>
          )}
        </div>
        {canRedeem ? (
          <a
            href={redeemUrl}
            style={{
              display: 'block', textAlign: 'center',
              background: ACCENT, color: ACCENT_TEXT,
              borderRadius: 100, padding: '9px 0',
              fontFamily: FB, fontSize: 13, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 0 20px 2px rgba(217,245,78,0.5), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
          >
            Redeem
          </a>
        ) : locked ? (
          <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: 0 }}>
            {need} more pts needed
          </p>
        ) : null}
      </div>
    </div>
  )
}

function VisitBar({ visits, target }: { visits: number; target: number }) {
  const pct = target > 0 ? Math.min(1, visits / target) : 0
  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: FB, fontSize: 14, fontWeight: 600, color: INK }}>
          {'Visit ' + target + 'x this month'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED }}>{visits + '/' + target}</span>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: visits >= target ? ACCENT : 'rgba(0,0,0,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: visits >= target ? ACCENT_TEXT : INK_MUTED, fontWeight: 700,
            boxShadow: visits >= target ? '0 0 12px rgba(217,245,78,0.5)' : 'none',
          }}>
            ✓
          </div>
        </div>
      </div>
      <div style={{ height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: (pct * 100).toFixed(1) + '%', background: ACCENT, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

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
  const visitCount = cx?.visit_count ?? 0
  const recentTxns = (cx?.recent_txns ?? []) as EarnTxn[]

  // Visits this month — count earn txns in current calendar month
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const visitsThisMonth = recentTxns.filter(t =>
    t.type === 'earn' && new Date(t.created_at) >= monthStart
  ).length
  const visitTarget = 5

  // Tier display: "Gold tier — N pts to next reward"
  const sortedRules = [...rewardRules].sort((a, b) => (a.threshold_value ?? 0) - (b.threshold_value ?? 0))
  const topThreshold = sortedRules.length > 0 ? (sortedRules[sortedRules.length - 1].threshold_value ?? null) : null
  const nextThreshold = sortedRules.find(r => (r.threshold_value ?? 0) > pts)?.threshold_value ?? null
  const ptsToNext = nextThreshold !== null ? (nextThreshold - pts) : 0

  const tierLabel = rawTier === 'gold' || rawTier === 'Gold' ? 'Gold' : rawTier === 'silver' || rawTier === 'Silver' ? 'Silver' : 'Member'

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK, paddingBottom: 100 }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box }
        @keyframes cx-fade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
      `}</style>

      {/* ── Header — lime glow section ── */}
      <div style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(217,245,78,0.38) 0%, transparent 70%), ' + BG,
        paddingTop: 56, paddingBottom: 0, textAlign: 'center',
        position: 'relative',
      }}>
        <h1 style={{
          fontFamily: FD, fontStyle: 'italic', fontSize: 52, fontWeight: 400,
          color: INK, margin: '0 0 6px', letterSpacing: '-0.02em', lineHeight: 1,
        }}>
          Rewards
        </h1>

        {/* Tier subtitle */}
        {loaded && cx && (
          <div style={{ margin: '0 0 20px', display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ fontFamily: FB, fontSize: 13, color: ACCENT_TEXT, fontWeight: 700, background: ACCENT, borderRadius: 100, padding: '4px 14px', display: 'inline-block' }}>
              {'↗ ' + tierLabel + ' tier' + (ptsToNext > 0 ? ' — ' + ptsToNext + ' pts to next reward' : ' — all rewards unlocked!')}
            </span>
          </div>
        )}
        {(!loaded || !cx) && <div style={{ height: 28 }} />}

        {/* Points ring composite — arc behind lime card */}
        <div style={{ position: 'relative', width: 220, height: 200, margin: '0 auto' }}>
          {/* Arc SVG — behind card */}
          <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 0 }}>
            <PointsArc pts={pts} threshold={topThreshold} />
          </div>
          {/* Pts inside lime rounded-rect card — in front of arc */}
          <div style={{
            position: 'absolute', top: 28, left: 28, right: 28, bottom: 10, zIndex: 1,
            background: 'rgba(217,245,78,0.18)',
            borderRadius: 24,
            boxShadow: '0 0 24px rgba(217,245,78,0.4)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <p style={{
              fontFamily: FB, fontSize: 64, fontWeight: 800, color: INK,
              margin: 0, lineHeight: 1, letterSpacing: '-0.03em',
            }}>
              {pts.toLocaleString()}
            </p>
            <p style={{ fontFamily: FB, fontSize: 15, color: INK_MUTED, margin: '4px 0 0', fontWeight: 500 }}>
              pts
            </p>
          </div>
        </div>
      </div>

      {/* ── Body — cream ── */}
      <div style={{ padding: '4px 18px 0' }}>

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

        {/* Prize shelf */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <h2 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 28, fontWeight: 600, margin: 0, color: INK }}>
              Prize shelf
            </h2>
            <span style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED }}>
              {rewardRules.length} {rewardRules.length === 1 ? 'reward' : 'rewards'}
            </span>
          </div>

          {rewardRules.length > 0 ? (
            <div>
              {rewardRules.map(r => (
                <RewardCard key={r.id} rule={r} pts={pts} slug={slug} />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '36px 0', background: '#fff', borderRadius: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎁</div>
              <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, margin: '0 0 8px', color: INK }}>
                Rewards coming soon
              </p>
              <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>
                {bizName} is setting up their loyalty catalog
              </p>
            </div>
          )}
        </div>

        {/* Visit progress */}
        {loaded && (cx || visitCount > 0) && (
          <VisitBar visits={cx ? visitsThisMonth : 0} target={visitTarget} />
        )}

        {/* Earn CTA — dark accent card */}
        <div style={{ background: CARD_DARK, borderRadius: 20, padding: '20px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 32 }}>☕</div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: '#fff', margin: '0 0 4px', fontWeight: 600 }}>
              Earn more points
            </p>
            <p style={{ fontFamily: FB, fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
              Every purchase earns loyalty points
            </p>
          </div>
          <a href={'/menu/' + slug} style={{ flexShrink: 0, background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '9px 16px', fontFamily: FB, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            Order
          </a>
        </div>
      </div>

      <CxTabBar slug={slug} active="rewards" />
    </div>
  )
}