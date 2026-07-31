/**
 * BRAIN-LOOP-1 PROOF — runs the REAL library functions (not a SQL re-implementation) against live
 * data, and prints the honest counts.
 *
 * Chain proven: active hypothesis -> Decisions queue -> accepted -> aria_actions row ->
 * baseline_metric_cents populated (the step that finally gives runOutcomeChecks() something to
 * measure).
 *
 * Run: npx tsx -r dotenv/config scripts/proof-brain-loop-1.ts dotenv_config_path=.env.local
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

const SIP = 'ff5055a0-c351-4ada-817a-1804961035f3'

async function main() {
  const { supabaseAdmin } = await import('../src/lib/supabase-admin')
  const { surfaceHypothesesToDecisions, DAILY_SURFACE_CAP } = await import('../src/lib/aria/hypothesis/surface-to-decisions')
  const { learnFromNonDecisions } = await import('../src/lib/aria/hypothesis/outcome-learning')

  console.log('=== BRAIN-LOOP-1 PROOF ===\n')

  console.log('-- STEP 1: learn from non-decisions (exclusions must hold) --')
  const nd = await learnFromNonDecisions(SIP)
  console.log(JSON.stringify(nd, null, 2))

  console.log('\n-- STEP 2: surface into the Decisions queue (cap = ' + DAILY_SURFACE_CAP + ') --')
  const s1 = await surfaceHypothesesToDecisions(SIP)
  console.log(JSON.stringify(s1, null, 2))

  console.log('\n-- STEP 3: DEDUPE — a second run same day must surface 0 --')
  const s2 = await surfaceHypothesesToDecisions(SIP)
  console.log(JSON.stringify(s2, null, 2))

  console.log('\n-- STEP 4: the surfaced rows, as they now stand --')
  const { data: surfaced } = await supabaseAdmin.from('aria_hypotheses')
    .select('id, title, category, status, surfaced_status, surfaced_at, decision_id')
    .eq('business_id', SIP).not('decision_id', 'is', null)
  console.log(JSON.stringify(surfaced, null, 2))

  console.log('\n-- STEP 5: the matching Decisions-queue cards (read-through by hypothesis_id) --')
  for (const h of (surfaced ?? []) as Array<Record<string, unknown>>) {
    const { data: d } = await supabaseAdmin.from('aria_autopilot_actions')
      .select('id, title, status, action_type, action_data')
      .eq('id', h.decision_id as string).maybeSingle()
    console.log(JSON.stringify(d, null, 2))
  }

  console.log('\n-- STEP 6: HONEST COUNTS (surfaced is NOT a learning count) --')
  const { data: all } = await supabaseAdmin.from('aria_hypotheses')
    .select('status, surfaced_status, decision_id, action_id, baseline_metric_cents, outcome_verdict')
    .eq('business_id', SIP)
  const rows = (all ?? []) as Array<Record<string, unknown>>
  console.log(JSON.stringify({
    total: rows.length,
    surfaced_to_decisions: rows.filter(r => r.decision_id).length,
    accepted_with_action:  rows.filter(r => r.action_id).length,
    with_baseline_metric:  rows.filter(r => r.baseline_metric_cents != null).length,
    with_measured_outcome: rows.filter(r => r.outcome_verdict).length,
    declined:              rows.filter(r => r.status === 'rejected').length,
    expired_unknown_surfaced_EXCLUDED_FOREVER: rows.filter(r => r.surfaced_status === 'unknown_surfaced').length,
  }, null, 2))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
