export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'
import type { LeaderboardRow, LeaderboardPeriod } from '@/lib/community/leaderboard'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

type Params = { params: Promise<{ id: string }> }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_RE = /^[a-z0-9-]+$/

const VALID_PERIODS = new Set(['7d', '30d', 'all'])

// GET ?period=7d|30d|all — top 10 + the viewer's own row pinned below if they exist but are outside
// the top 10. Reads the persisted snapshot only (no live recompute — that's the daily cron's job).
// CX-CLARITY-1 — [id] accepts either a real uuid or businesses.slug (resolveBusinessId).
export async function GET(req: Request, { params }: Params) {
  const { id: idOrSlug } = await params
  if (!idOrSlug) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!UUID_RE.test(idOrSlug) && !SLUG_RE.test(idOrSlug)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const id = await resolveBusinessId(supabaseAdmin, idOrSlug)
  if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
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

  // CX-GAME-2 — trophy marker on real, already-issued weekly awards only (not a live re-derivation
  // of "who's currently top 3" — a member could be top-3 today without an award existing yet if this
  // isn't the week-boundary day). Most recent period_start for this business.
  const trophyMemberIds = new Set<string>()
  if (period === '7d') {
    const { data: latestPeriod } = await supabaseAdmin.from('community_leaderboard_awards')
      .select('period_start').eq('business_id', id).order('period_start', { ascending: false }).limit(1).maybeSingle()
    if (latestPeriod?.period_start) {
      const { data: awards } = await supabaseAdmin.from('community_leaderboard_awards')
        .select('loyalty_identity_id').eq('business_id', id).eq('period_start', latestPeriod.period_start as string)
      const identityIds = (awards ?? []).map(a => a.loyalty_identity_id as string)
      if (identityIds.length) {
        const { data: links } = await supabaseAdmin.from('community_member_loyalty_links')
          .select('member_id').eq('business_id', id).in('loyalty_identity_id', identityIds)
        for (const l of links ?? []) trophyMemberIds.add(l.member_id as string)
      }
    }
  }

  return NextResponse.json({
    period,
    computed_at: snapshot?.computed_at ?? null,
    top: top10.map(r => ({ ...r, trophy: trophyMemberIds.has(r.member_id) })),
    viewer: viewerRow ? { ...viewerRow, trophy: trophyMemberIds.has(viewerRow.member_id) } : null,
    total_ranked: allRows.length,
  })
}
