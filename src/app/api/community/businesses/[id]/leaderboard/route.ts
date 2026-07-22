export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'
import type { LeaderboardRow, LeaderboardPeriod } from '@/lib/community/leaderboard'

type Params = { params: Promise<{ id: string }> }

const VALID_PERIODS = new Set(['7d', '30d', 'all'])

// GET ?period=7d|30d|all — top 10 + the viewer's own row pinned below if they exist but are outside
// the top 10. Reads the persisted snapshot only (no live recompute — that's the daily cron's job).
export async function GET(req: Request, { params }: Params) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const period = (new URL(req.url).searchParams.get('period') ?? '7d') as LeaderboardPeriod
  if (!VALID_PERIODS.has(period)) return NextResponse.json({ error: 'invalid period' }, { status: 400 })

  const { data: snapshot } = await supabaseAdmin
    .from('community_leaderboard_snapshots')
    .select('rows, computed_at')
    .eq('business_id', id).eq('period', period).maybeSingle()

  const allRows = ((snapshot?.rows ?? []) as LeaderboardRow[]).sort((a, b) => a.rank - b.rank)
  const top10 = allRows.slice(0, 10)

  const member = await getCommunityMember()
  let viewerRow: LeaderboardRow | null = null
  if (member) {
    const inTop10 = top10.find(r => r.member_id === member.id)
    if (!inTop10) viewerRow = allRows.find(r => r.member_id === member.id) ?? null
  }

  return NextResponse.json({
    period,
    computed_at: snapshot?.computed_at ?? null,
    top: top10,
    viewer: viewerRow,
    total_ranked: allRows.length,
  })
}
