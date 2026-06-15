export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { detectPatterns } from '@/lib/aria/pattern-detection'
import { logAICallSafe } from '@/lib/aria/log-ai-call'

// PATTERN-MEMORY-1 (I3) — weekly cron. Detects DURABLE data patterns and writes them to
// aria_business_memory (kind='pattern', source_type='signal'), superseding on content change.
export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const { data: businesses } = await supabaseAdmin
    .from('businesses').select('id').eq('is_active', true)
    .in('subscription_status', ['active', 'trialing'])
  if (!businesses?.length) return NextResponse.json({ ok: true, processed: 0 })

  let processed = 0, detected = 0, written = 0, superseded = 0, skipped = 0
  const DEADLINE_MS = 260_000
  const start = Date.now()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  for (const biz of businesses) {
    if (Date.now() - start > DEADLINE_MS) break
    const bid = biz.id as string
    try {
      // Gate: business must have ≥30 days of pos_sales history (oldest completed sale ≤ 30d ago)
      const { data: oldest } = await supabaseAdmin.from('pos_sales').select('created_at')
        .eq('business_id', bid).eq('status', 'completed').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!oldest || (oldest.created_at as string) > thirtyDaysAgo) { skipped++; continue }

      // Gate: skip if a pattern was written for this business < 7 days ago
      const { data: lastPattern } = await supabaseAdmin.from('aria_business_memory').select('created_at')
        .eq('business_id', bid).eq('kind', 'pattern').eq('is_active', true)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (lastPattern && (lastPattern.created_at as string) > sevenDaysAgo) { skipped++; continue }

      const patterns = await detectPatterns(bid)
      detected += patterns.length
      for (const p of patterns) {
        // Existing active pattern with the same topic?
        const { data: existing } = await supabaseAdmin.from('aria_business_memory')
          .select('id, content').eq('business_id', bid).eq('kind', 'pattern').eq('topic', p.topic)
          .eq('is_active', true).is('deleted_at', null).limit(1).maybeSingle()
        if (existing && existing.content === p.content) continue // unchanged → no duplicate
        // Insert the new pattern. NOTE: aria_business_memory has no `source` column — provenance
        // is carried by source_type='signal' (writing `source` previously errored → 0 rows).
        const { data: inserted, error: insErr } = await supabaseAdmin.from('aria_business_memory').insert({
          business_id: bid, kind: 'pattern', source_type: 'signal', topic: p.topic,
          content: p.content, confidence: p.confidence, importance: p.importance,
        }).select('id').maybeSingle()
        if (insErr || !inserted?.id) { console.error('[pattern-memory] insert failed:', bid, p.topic, insErr?.message); continue }
        written++
        // Supersede the old one (preserve history)
        if (existing && inserted?.id) {
          await supabaseAdmin.from('aria_business_memory')
            .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_reason: 'superseded', superseded_by: inserted.id })
            .eq('id', existing.id)
          superseded++
        }
      }
      processed++
    } catch (e) { console.error('[pattern-memory] business failed:', bid, (e as Error).message) }
  }

  // Part 4: log the run
  void logAICallSafe({
    business_id: null, agent_key: 'pattern_detector', role: 'data', provider: 'other', success: true,
    request_summary: `businesses:${processed}`,
    response_summary: JSON.stringify({ patterns_detected: detected, patterns_written: written, patterns_superseded: superseded, skipped }).slice(0, 200),
  })

  return NextResponse.json({ ok: true, processed, detected, written, superseded, skipped })
}
