import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  WRITER_REGISTRY, classifyWriter, classifyCron, sortColdest,
  type WriterVerdict, type CronVerdict,
} from './inertness'

/**
 * MS15 PHASE 6 — THE COLD LIST, GENERATED LIVE.
 *
 * Every cold writer, cron and guard in one place, oldest first. Generated from the registry and
 * the database on every call — never a hardcoded list, because a hardcoded inventory of
 * not-working things is itself a thing that stops working.
 *
 * This is the sprint's reusable asset: the query shape is identical to "which menu item has never
 * sold", which is the same question an owner asks about their own business. Building it for
 * ourselves first means it can be pointed at their data next.
 */

export interface ColdListReport {
  generated_at: string
  writers: WriterVerdict[]
  crons: CronVerdict[]
  /** The subset that needs a human: cold-and-should-have-fired, or previously-warm-and-stopped. */
  suspicious: Array<{ kind: 'writer' | 'cron'; name: string; detail: string }>
  summary: { writers_cold: number; writers_stale: number; crons_cold: number; crons_stale: number }
}

/**
 * Count rows and find the newest, for one target. Each registry entry names a table and an
 * optional filter; nothing here is guessed from the table name.
 */
const TARGET_QUERIES: Record<string, { table: string; timeColumn: string; filter?: (q: ReturnType<typeof buildBase>) => ReturnType<typeof buildBase> }> = {
  'usage_logs': { table: 'usage_logs', timeColumn: 'created_at' },
  'aria_business_memory (kind=house_rule)': { table: 'aria_business_memory', timeColumn: 'created_at', filter: q => q.eq('kind', 'house_rule') },
  'aria_skills (kind=agent)': { table: 'aria_skills', timeColumn: 'created_at', filter: q => q.eq('kind', 'agent') },
  'stripe_events': { table: 'stripe_events', timeColumn: 'received_at' },
  'aria_conversation_summaries': { table: 'aria_conversation_summaries', timeColumn: 'created_at' },
  'aria_advice_weights': { table: 'aria_advice_weights', timeColumn: 'updated_at' },
  'aria_action_log': { table: 'aria_action_log', timeColumn: 'executed_at' },
  'aria_task_outputs': { table: 'aria_task_outputs', timeColumn: 'created_at' },
}

function buildBase(table: string) {
  return supabaseAdmin.from(table).select('*', { count: 'exact', head: true })
}

async function observeTarget(target: string): Promise<{ rowCount: number; lastRowAt: string | null }> {
  const spec = TARGET_QUERIES[target]
  if (!spec) return { rowCount: 0, lastRowAt: null }
  try {
    let countQuery = buildBase(spec.table)
    if (spec.filter) countQuery = spec.filter(countQuery)
    const { count } = await countQuery

    let lastRowAt: string | null = null
    if ((count ?? 0) > 0) {
      let rowQuery = supabaseAdmin.from(spec.table).select(spec.timeColumn).order(spec.timeColumn, { ascending: false }).limit(1)
      if (spec.filter) rowQuery = (spec.filter as unknown as (q: typeof rowQuery) => typeof rowQuery)(rowQuery)
      const { data } = await rowQuery
      lastRowAt = (data?.[0] as Record<string, string> | undefined)?.[spec.timeColumn] ?? null
    }
    return { rowCount: count ?? 0, lastRowAt }
  } catch (e) {
    console.error('[cold-list] observe failed for', target, (e as Error).message)
    // A failed observation must not read as "cold" — that would invent a finding.
    return { rowCount: -1, lastRowAt: null }
  }
}

export async function buildColdList(now: Date = new Date()): Promise<ColdListReport> {
  // WRITERS — every registry entry, observed live.
  const writers: WriterVerdict[] = []
  for (const expectation of WRITER_REGISTRY) {
    const observed = await observeTarget(expectation.target)
    if (observed.rowCount < 0) continue // observation failed; say nothing rather than something false
    writers.push(classifyWriter(expectation, observed, now))
  }

  // CRONS — registered jobs vs what has actually logged a run.
  const crons: CronVerdict[] = []
  try {
    const { data: rows } = await supabaseAdmin
      .from('cron_logs')
      .select('job_name, started_at, status')
      .order('started_at', { ascending: false })
      .limit(5000)

    const byJob = new Map<string, { runs: number; lastRunAt: string | null; failures: number }>()
    for (const r of (rows ?? []) as Array<{ job_name: string; started_at: string; status: string }>) {
      const entry = byJob.get(r.job_name) ?? { runs: 0, lastRunAt: null, failures: 0 }
      entry.runs++
      if (!entry.lastRunAt || r.started_at > entry.lastRunAt) entry.lastRunAt = r.started_at
      if (r.status === 'failed') entry.failures++
      byJob.set(r.job_name, entry)
    }
    for (const [job, observed] of byJob) crons.push(classifyCron(job, observed, now))
  } catch (e) {
    console.error('[cold-list] cron observation failed:', (e as Error).message)
  }

  const sortedWriters = sortColdest(writers, w => w.daysSinceLastRow ?? w.daysSinceDeploy)
  const sortedCrons = sortColdest(crons, c => c.daysSinceLastRun ?? 9999)

  return {
    generated_at: now.toISOString(),
    writers: sortedWriters,
    crons: sortedCrons,
    suspicious: [
      ...sortedWriters.filter(w => w.suspicious).map(w => ({ kind: 'writer' as const, name: w.target, detail: w.detail })),
      ...sortedCrons.filter(c => c.suspicious).map(c => ({ kind: 'cron' as const, name: c.job, detail: c.detail })),
    ],
    summary: {
      writers_cold: sortedWriters.filter(w => w.state === 'cold').length,
      writers_stale: sortedWriters.filter(w => w.state === 'stale').length,
      crons_cold: sortedCrons.filter(c => c.state === 'cold').length,
      crons_stale: sortedCrons.filter(c => c.state === 'stale').length,
    },
  }
}
