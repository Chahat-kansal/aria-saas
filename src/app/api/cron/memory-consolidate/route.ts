export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Memory = {
  id: string
  business_id: string
  kind: string
  content: string
  importance: number
  reference_count: number | null
  created_at: string
}

function normaliseContent(content: string): string {
  return content.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

// Simple word-overlap score between two strings (0–1)
function wordOverlap(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  if (setA.size === 0 || setB.size === 0) return 0
  let overlap = 0
  for (const w of setA) { if (setB.has(w)) overlap++ }
  return overlap / Math.max(setA.size, setB.size)
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronLogId = crypto.randomUUID()
  await supabaseAdmin.from('cron_logs').insert({
    id: cronLogId,
    job_name: 'memory-consolidate',
    status: 'running',
    started_at: new Date().toISOString(),
  })

  let expired = 0, deleted = 0, merged = 0, boosted = 0
  const errors: string[] = []

  try {
    // Fetch all active businesses that have memories
    const { data: bizIds } = await supabaseAdmin
      .from('aria_business_memory')
      .select('business_id')
      .eq('is_active', true)
      .is('deleted_at', null)

    const uniqueBizIds = [...new Set((bizIds ?? []).map((r: { business_id: string }) => r.business_id))]

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

    for (const bid of uniqueBizIds) {
      try {
        const { data: memories } = await supabaseAdmin
          .from('aria_business_memory')
          .select('id, business_id, kind, content, importance, reference_count, created_at')
          .eq('business_id', bid)
          .eq('is_active', true)
          .is('deleted_at', null)

        if (!memories?.length) continue
        const mems = memories as Memory[]

        // ── Step 1: Expire stale, rarely-referenced, low-importance memories ──
        const stale = mems.filter(m =>
          m.created_at < thirtyDaysAgo &&
          (m.reference_count ?? 0) < 2 &&
          m.importance < 6
        )

        for (const m of stale) {
          if (m.importance < 3) {
            // Hard delete trivial memories
            await supabaseAdmin.from('aria_business_memory')
              .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_reason: 'consolidation_expired' })
              .eq('id', m.id)
            deleted++
          } else {
            // Soft expire
            await supabaseAdmin.from('aria_business_memory')
              .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_reason: 'consolidation_stale' })
              .eq('id', m.id)
            expired++
          }
        }

        // Work with remaining active memories for dedup
        const activeMems = mems.filter(m => m.importance >= 6 || m.created_at >= thirtyDaysAgo || (m.reference_count ?? 0) >= 2)

        // ── Step 2: De-duplicate near-identical content ──
        // Group by normalised content prefix — keep highest importance, soft-delete others
        const seen = new Map<string, Memory>()
        const toMerge: string[] = []

        for (const m of activeMems) {
          const key = normaliseContent(m.content)

          // Check word overlap against all seen keys
          let matched = false
          for (const [seenKey, seenMem] of seen) {
            if (wordOverlap(key, seenKey) >= 0.85) {
              // Duplicate found — keep highest importance
              if (m.importance > seenMem.importance) {
                toMerge.push(seenMem.id)
                seen.delete(seenKey)
                seen.set(key, m)
              } else {
                toMerge.push(m.id)
              }
              matched = true
              break
            }
          }
          if (!matched) seen.set(key, m)
        }

        if (toMerge.length > 0) {
          await supabaseAdmin.from('aria_business_memory')
            .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_reason: 'consolidation_duplicate' })
            .in('id', toMerge)
          merged += toMerge.length
        }

        // ── Step 3: Boost memories tied to acted-on outcomes ──
        const { data: outcomes } = await supabaseAdmin
          .from('aria_outcomes')
          .select('recommendation_detail')
          .eq('business_id', bid)
          .eq('acted_on', true)
          .not('recommendation_detail', 'is', null)
          .gte('acted_on_at', thirtyDaysAgo)

        if (outcomes && outcomes.length > 0) {
          const outcomeTexts = (outcomes as Array<{ recommendation_detail: string | null }>)
            .map(o => o.recommendation_detail ?? '')
            .filter(Boolean)

          const surviving = [...seen.values()]
          for (const m of surviving) {
            const shouldBoost = outcomeTexts.some(ot => wordOverlap(m.content, ot) >= 0.5)
            if (shouldBoost && m.importance < 10) {
              await supabaseAdmin.from('aria_business_memory')
                .update({ importance: Math.min(10, m.importance + 1) })
                .eq('id', m.id)
              boosted++
            }
          }
        }
      } catch (e) {
        errors.push(bid + ': ' + (e as Error).message.slice(0, 100))
      }
    }

    await supabaseAdmin.from('cron_logs').update({
      status: errors.length > 0 ? 'failed' : 'completed',
      finished_at: new Date().toISOString(),
      businesses_processed: uniqueBizIds.length,
      errors: { expired, deleted, merged, boosted, ...(errors.length > 0 ? { items: errors } : {}) },
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, businesses: uniqueBizIds.length, expired, deleted, merged, boosted, errors: errors.length })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      errors: { message: msg },
    }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
