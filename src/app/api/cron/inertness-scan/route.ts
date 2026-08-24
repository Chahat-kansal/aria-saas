export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { buildColdList } from '@/lib/ops/cold-list'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * MS15 PHASE 5 — the nightly inertness scan.
 *
 * Asks one question of every registered writer and cron: HAS THIS EVER LANDED A ROW? Anything at
 * zero since deploy is flagged COLD — a distinct state from broken, and not an error. The scan
 * itself writes a cron_logs row, which means it is subject to its own ledger: if this job ever
 * goes cold, the next run of the cold list says so.
 */
async function _GET(req: Request) {
  // The canonical cron guard returns a Response on failure, null on success — the deprecated
  // '@/lib/cron-auth' returns a boolean with inverted sense, and a lint rail caught me reaching
  // for it. Exactly the class of mistake the rails exist for.
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const startedAt = new Date().toISOString()
  const report = await buildColdList()

  // Log our own run, so the watcher is watched.
  try {
    await supabaseAdmin.from('cron_logs').insert({
      job_name: 'inertness-scan',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      businesses_processed: 0,
      status: 'success',
      errors: report.suspicious.length,
    })
  } catch (e) {
    console.error('[inertness-scan] cron_logs insert failed (non-fatal):', (e as Error).message)
  }

  // Loud in the logs when something needs a human — a report nobody reads is another cold thing.
  for (const s of report.suspicious) {
    console.warn('[inertness-scan] SUSPICIOUS', s.kind, s.name, '—', s.detail)
  }

  return NextResponse.json(report)
}

export const GET = _GET
export const POST = _GET
