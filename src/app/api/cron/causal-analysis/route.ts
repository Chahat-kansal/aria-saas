export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { analyzeEvent } from '@/lib/aria/causal-analysis'
import { scanAndEmitEvents } from '@/lib/aria/event-emitter'

// I12 CAUSAL Part 3 — daily. (1) expand event sources via scanAndEmitEvents, then (2) run causal
// inference on each high/medium intelligence_event not yet analysed, writing the result into
// data.causal_analysis (never as bare fact — always with explicit p). When p_caused >= 60% (the
// statistical floor) the finding is also stored as a durable pattern memory (kind='pattern',
// source_type='signal', source_id=null — valid after I3-REWIRE; NO 'source' field).
const P_FLOOR = 60

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const { data: subs } = await supabaseAdmin
    .from('business_subscriptions')
    .select('business_id')
    .in('status', ['active', 'trialing'])
  const bizIds = [...new Set((subs ?? []).map((s: { business_id: string }) => s.business_id))]

  const since90d = new Date(Date.now() - 90 * 86400000).toISOString()
  const until3d = new Date(Date.now() - 3 * 86400000).toISOString() // let the 14d post window mature a little

  let emitted = 0
  let analysed = 0
  let patternsWritten = 0
  const errors: string[] = []

  for (const bid of bizIds) {
    try {
      const scan = await scanAndEmitEvents(bid)
      emitted += scan.emitted
    } catch (e) { errors.push(`scan ${bid}: ${(e as Error).message}`) }

    // Unanalyzed high/medium events with a (mostly) complete post window
    const { data: events } = await supabaseAdmin
      .from('intelligence_events')
      .select('id, data')
      .eq('business_id', bid)
      .in('severity', ['high', 'medium'])
      .is('data->causal_analysis', null)
      .gte('triggered_at', since90d)
      .lte('triggered_at', until3d)
      .order('triggered_at', { ascending: false })
      .limit(25)

    for (const ev of (events ?? []) as Array<{ id: string; data: Record<string, unknown> | null }>) {
      try {
        const hyp = await analyzeEvent(ev.id)
        if (!hyp) continue
        await supabaseAdmin
          .from('intelligence_events')
          .update({ data: { ...(ev.data ?? {}), causal_analysis: hyp } })
          .eq('id', ev.id)
        analysed++

        if (hyp.p_caused_pct >= P_FLOOR) {
          await supabaseAdmin.from('aria_business_memory').insert({
            business_id: bid,
            kind: 'pattern',
            source_type: 'signal',
            source_id: null,
            content: hyp.reasoning,
            importance: hyp.p_caused_pct >= 80 ? 4 : 3,
            is_active: true,
          })
          patternsWritten++
        }
      } catch (e) { errors.push(`analyze ${ev.id}: ${(e as Error).message}`) }
    }
  }

  return NextResponse.json({
    ok: true,
    businesses: bizIds.length,
    events_emitted: emitted,
    events_analysed: analysed,
    patterns_written: patternsWritten,
    p_floor: P_FLOOR,
    errors,
  })
}
