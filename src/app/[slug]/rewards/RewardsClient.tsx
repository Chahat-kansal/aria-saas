'use client'
import { useState, useEffect } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#fafafa'
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

interface CxData {
  found: boolean
  customer_id?: string
  name?: string
  points_balance?: number
  loyalty_tier?: string | null
  wallet_balance?: number
  challenges?: Challenge[]
  recent_txns?: unknown[]
}

// Ring: lime fill on light grey track — readable on #fafafa
function PointsRing({ pts, threshold }: { pts: number; threshold: number | null }) {
  const R = 72
  const C = 2 * Math.PI * R
  const pct = threshold && threshold > 0 ? Math.min(1, pts / threshold) : (pts > 0 ? 0.25 : 0.03)
  const fill = pct * C
  return (
    <svg width={180} height={180} viewBox="0 0 180 180" aria-hidden="true" style={{ display: 'block' }}>
      <circle cx={90} cy={90} r={R} fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth={10}/>
      {fill > 0 && (
        <circle
          cx={90} cy={90} r={R} fill="none"
          stroke={ACCENT} strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={String(fill.toFixed(2)) + ' ' + String((C - fill).toFixed(2))}
          transform="rotate(-90 90 90)"
        />
      )}
    </svg>
  )
}

function RewardCard({ rule, pts }: { rule: RewardRule; pts: number }) {
  const cost = Number(rule.threshold_value ?? 0)
  const canRedeem = pts >= cost
  const need = cost - pts

  return (
    <div style={{
      borderRadius: 20, background: '#fff', overflow: 'hidden',
      boxShadow: '0 3px 16px rgba(0,0,0,0.08)',
      opacity: canRedeem ? 1 : 0.7,
      border: canRedeem ? ('2px solid ' + ACCENT) : '2px solid transparent',
    }}>
      <div style={{
        width: '100%', height: 140,
        background: rule.image_url ? ('url(' + rule.image_url + ') center/cover no-repeat #efefef') : '#f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36, position: 'relative',
      }}>
        {!rule.image_url && '☕'}
        {!canRedeem && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 26, color: '#fff', opacity: 0.85 }}>🔒</span>
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px 14px' }}>
        <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 16, fontWeight: 600, margin: '0 0 4px', color: INK }}>
          {rule.name}
        </p>
        {rule.description && (
          <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: '0 0 10px', lineHeight: 1.4 }}>
            {rule.description}
          </p>
        )}
        {cost > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 700, color: INK }}>
              {cost} pts
            </span>
            {canRedeem ? (
              <span style={{ background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '5px 14px', fontFamily: FB, fontSize: 12, fontWeight: 700 }}>
                Redeem
              </span>
            ) : (
              <span style={{ fontFamily: FB, fontSize: 11, color: INK_MUTED }}>
                {need} more pts
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ChallengeBar({ challenge }: { challenge: Challenge }) {
  const pct = challenge.target_count > 0 ? Math.min(1, challenge.progress / challenge.target_count) : 0
  return (
    <div style={{ background: '#fff', borderRadius: 18, padding: '14px 16px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 600, margin: '0 0 2px', color: INK }}>{challenge.title}</p>
          {challenge.description && (
            <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: 0 }}>{challenge.description}</p>
          )}
        </div>
        <span style={{ fontFamily: FB, fontSize: 12, color: ACCENT_TEXT, background: ACCENT + '33', borderRadius: 100, padding: '3px 10px', marginLeft: 8, whiteSpace: 'nowrap', fontWeight: 600 }}>
          +{challenge.reward_points} pts
        </span>
      </div>
      <div style={{ height: 6, background: '#efefef', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{ height: '100%', width: (pct * 100).toFixed(1) + '%', background: ACCENT, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
      <p style={{ fontFamily: FB, fontSize: 11, color: INK_MUTED, margin: 0 }}>
        {challenge.progress} / {challenge.target_count}
      </p>
    </div>
  )
}

export function RewardsClient({ slug, bizName, logoUrl, rewardRules }: {
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
  const tier = cx?.loyalty_tier ?? 'Member'
  const firstName = cx?.name?.split(' ')[0] ?? null
  const challenges = (cx?.challenges ?? []) as Challenge[]
  const topThreshold = rewardRules.length > 0 ? (rewardRules[rewardRules.length - 1].threshold_value ?? null) : null

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK, paddingBottom: 100 }}>
      <style>{`*, *::before, *::after { box-sizing: border-box }`}</style>

      {/* ── Header — LIGHT, ink text ── */}
      <div style={{
        background: BG,
        paddingTop: 56, paddingBottom: 28, paddingLeft: 20, paddingRight: 20,
        borderBottom: '1px solid rgba(0,0,0,0.07)',
        textAlign: 'center',
      }}>
        <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 34, color: INK, margin: '0 0 2px', fontWeight: 400, letterSpacing: '-0.01em' }}>
          Rewards
        </h1>
        {firstName && (
          <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: '0 0 20px' }}>
            {'Hey, ' + firstName + '!'}
          </p>
        )}
        {!firstName && <div style={{ height: 20 }} />}

        {/* Points ring — lime fill on light track */}
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 12 }}>
          <PointsRing pts={pts} threshold={topThreshold} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
            <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 48, fontWeight: 600, color: INK, lineHeight: 1 }}>
              {pts}
            </div>
            <div style={{ fontFamily: FB, fontSize: 11, color: INK_MUTED, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
              points
            </div>
          </div>
        </div>

        {/* Tier badge */}
        <div>
          <span style={{ display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '5px 18px', fontFamily: FB, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {tier}
          </span>
        </div>

        {/* Progress text */}
        {topThreshold && pts < topThreshold && (
          <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, marginTop: 10, marginBottom: 0 }}>
            {topThreshold - pts} pts to next reward
          </p>
        )}
        {topThreshold && pts >= topThreshold && (
          <p style={{ fontFamily: FB, fontSize: 13, color: ACCENT_TEXT, background: ACCENT + '33', display: 'inline-block', borderRadius: 100, padding: '4px 14px', marginTop: 10, marginBottom: 0, fontWeight: 600 }}>
            🎉 Reward ready to redeem!
          </p>
        )}
      </div>

      {/* Not logged in prompt */}
      {loaded && !cx && (
        <div style={{ margin: '24px 18px', padding: '20px', background: '#fff', borderRadius: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, margin: '0 0 14px', color: INK }}>
            Check your points
          </p>
          <a href={'/' + slug} style={{ display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '10px 24px', fontFamily: FB, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            Sign in on Home
          </a>
        </div>
      )}

      {/* ── Reward catalog ── */}
      <div style={{ padding: '24px 18px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <h2 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, fontWeight: 600, margin: 0, color: INK }}>
            Prize shelf
          </h2>
          <span style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED }}>
            {rewardRules.length} {rewardRules.length === 1 ? 'reward' : 'rewards'}
          </span>
        </div>

        {rewardRules.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {rewardRules.map(r => (
              <RewardCard key={r.id} rule={r} pts={pts} />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '36px 0', background: '#fff', borderRadius: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
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

      {/* ── Challenges ── */}
      {challenges.length > 0 && (
        <div style={{ padding: '24px 18px 0' }}>
          <h2 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, fontWeight: 600, margin: '0 0 14px', color: INK }}>
            Challenges
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {challenges.map(c => (
              <ChallengeBar key={c.id} challenge={c} />
            ))}
          </div>
        </div>
      )}

      {/* ── Earn CTA — dark accent card (intentional design element) ── */}
      <div style={{ padding: '24px 18px 0' }}>
        <div style={{ background: CARD_DARK, borderRadius: 20, padding: '20px', display: 'flex', alignItems: 'center', gap: 14 }}>
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