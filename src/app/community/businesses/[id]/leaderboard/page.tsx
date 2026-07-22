'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowUp, ArrowDown } from 'lucide-react'
import { PALETTE, BORDER, RADIUS, MAX_W } from '../../../theme'
import { LevelChip } from '../../../LevelChip'

interface Row {
  member_id: string
  display_name: string
  level: number
  visits: number
  points: number
  challenges: number
  referrals: number
  score: number
  rank: number
  rankMovement: number | null
  trophy?: boolean
}
interface LeaderboardResponse {
  period: '7d' | '30d' | 'all'
  computed_at: string | null
  top: Row[]
  viewer: Row | null
  total_ranked: number
}

const TABS: Array<{ key: '7d' | '30d' | 'all'; label: string }> = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
]

function MovementArrow({ movement }: { movement: number | null }) {
  if (movement == null || movement === 0) return null
  return movement > 0
    ? <span style={{ display: 'inline-flex', alignItems: 'center', color: PALETTE.ink, fontSize: 10, fontWeight: 700 }}><ArrowUp size={11} />{movement}</span>
    : <span style={{ display: 'inline-flex', alignItems: 'center', color: PALETTE.live, fontSize: 10, fontWeight: 700 }}><ArrowDown size={11} />{Math.abs(movement)}</span>
}

function LeaderboardRowView({ row, highlight }: { row: Row; highlight?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      background: highlight ? PALETTE.accent : PALETTE.surface,
      border: BORDER, borderRadius: RADIUS.md, marginBottom: 6,
    }}>
      <span style={{ width: 22, textAlign: 'center', fontSize: 13, fontWeight: 800, color: PALETTE.ink, flexShrink: 0 }}>{row.rank}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: PALETTE.ink, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* CX-GAME-2 — trophy on a REAL issued weekly award only (see the API route's join against
              community_leaderboard_awards) — never a live "you'd currently be top-3" guess. */}
          {row.trophy && <span aria-label="Won this week's leaderboard reward">🏆</span>}
          {row.display_name}
          <LevelChip level={{ level: row.level, name: '' }} />
          <MovementArrow movement={row.rankMovement} />
        </p>
        <p style={{ fontSize: 10, color: PALETTE.inkSoft, margin: '2px 0 0' }}>
          {row.visits} visit{row.visits === 1 ? '' : 's'} · {row.points} pts · {row.challenges} challenge{row.challenges === 1 ? '' : 's'} · {row.referrals} referral{row.referrals === 1 ? '' : 's'}
        </p>
      </div>
    </div>
  )
}

export default function LeaderboardPage() {
  const params = useParams<{ id: string }>()
  const businessId = params.id
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('7d')
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: '7d' | '30d' | 'all') => {
    if (!businessId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/community/businesses/${businessId}/leaderboard?period=${p}`)
      setData(res.ok ? await res.json() : null)
    } catch { setData(null) }
    setLoading(false)
  }, [businessId])

  useEffect(() => { load(period) }, [load, period])

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '12px 16px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Link href={`/community/businesses/${businessId}`} aria-label="Back"
          style={{ width: 36, height: 36, borderRadius: '50%', border: BORDER, background: PALETTE.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={18} color={PALETTE.ink} />
        </Link>
        <h1 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: PALETTE.ink }}>leaderboard</h1>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setPeriod(t.key)} style={{
            flex: 1, padding: '8px 0', borderRadius: RADIUS.pill, border: BORDER, cursor: 'pointer',
            background: period === t.key ? PALETTE.accent : PALETTE.surface,
            color: PALETTE.ink, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ height: 200, background: PALETTE.surfaceAlt, borderRadius: RADIUS.lg }} />
      ) : !data || data.top.length === 0 ? (
        <p style={{ fontSize: 12, color: PALETTE.inkSoft, textAlign: 'center', padding: 28, fontWeight: 500 }}>
          No ranked members yet for this window — be the first to show up.
        </p>
      ) : (
        <>
          {data.top.map(row => <LeaderboardRowView key={row.member_id} row={row} />)}
          {data.viewer && (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: PALETTE.inkSoft, margin: '14px 0 6px' }}>your rank</p>
              <LeaderboardRowView row={data.viewer} highlight />
            </>
          )}
        </>
      )}

      <p style={{ fontSize: 10, color: PALETTE.inkSoft, textAlign: 'center', margin: '16px 0 0', lineHeight: 1.5 }}>
        Ranked by real visits, points, challenges and referrals — updated daily.
      </p>
    </main>
  )
}
