/**
 * OWNER-APP PH-2 — dev-only seed for Jobs + the business_events spine.
 *
 * Inserts: 1 running job mid-progress (8 steps, 4 done/1 active/3 pending), 1 done job that
 * produced PH-1's seeded purchase_order decision (linked via
 * aria_autopilot_actions.action_data->>'source_job_id', no new FK column), 1 failed job, and the
 * 3 standing jobs from the locked mockup (sun_20:00/mon_07:00/quarterly) — plus the
 * business_events rows those lifecycles produce, so the spine is visibly populated. Idempotent —
 * keyed off fixed UUIDs, safe to re-run. NEVER runs in the prod path.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (dev project, never prod).
 * Run: npx tsx scripts/seed-owner-jobs.ts
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SIP_BUSINESS_ID = 'ff5055a0-c351-4ada-817a-1804961035f3'
const PURCHASE_ORDER_DECISION_ID = '00000000-0000-4000-b000-000000000007' // PH-1's seed

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[seed-owner-jobs] refusing to run with NODE_ENV=production — aborting.')
    process.exit(1)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[seed-owner-jobs] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required — aborting.')
    process.exit(1)
  }
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const now = Date.now()
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString()

  const jobs = [
    {
      id: '00000000-0000-4000-c000-000000000001', title: 'Compare my top 3 suppliers on price',
      status: 'running', started_at: iso(6 * 60_000),
      steps: [
        { label: 'Reading your supplier price imports', state: 'done' },
        { label: 'Matching products across suppliers', state: 'done' },
        { label: 'Checking your last 90 days of purchase orders', state: 'done' },
        { label: 'Computing price deltas per product', state: 'done' },
        { label: 'Flagging the biggest swings', state: 'active' },
        { label: 'Drafting the comparison summary', state: 'pending' },
        { label: 'Checking for any missing supplier data', state: 'pending' },
        { label: 'Preparing your deliverable', state: 'pending' },
      ], progress_step: 4,
    },
    {
      id: '00000000-0000-4000-c000-000000000002', title: 'Check stock levels and raise a purchase order',
      status: 'done', started_at: iso(2 * 3600_000), completed_at: iso(110 * 60_000), last_run_at: iso(110 * 60_000),
      steps: [{ label: 'Checked stock levels against reorder points', state: 'done' }], progress_step: 1,
    },
    {
      id: '00000000-0000-4000-c000-000000000003', title: 'Reconcile last month\'s Xero export',
      status: 'failed', started_at: iso(40 * 60_000), completed_at: iso(38 * 60_000), last_run_at: iso(38 * 60_000),
      steps: [{ label: 'Working on your request', state: 'failed' }],
      error_message: 'Xero sync token expired — reconnect Xero in Settings and try again.',
    },
  ] as const

  for (const j of jobs) {
    const { error } = await db.from('aria_user_tasks').upsert({
      id: j.id, business_id: SIP_BUSINESS_ID, title: j.title, task_prompt: j.title,
      status: j.status, steps: j.steps, progress_step: 'progress_step' in j ? j.progress_step : 0,
      created_by: 'owner', notify_email: true,
      started_at: j.started_at, completed_at: 'completed_at' in j ? j.completed_at : null,
      last_run_at: 'last_run_at' in j ? j.last_run_at : null,
      error_message: 'error_message' in j ? j.error_message : null,
    }, { onConflict: 'id' })
    if (error) console.error('[seed-owner-jobs] failed for', j.title, error.message)
    else console.log('[seed-owner-jobs] seeded job', j.title)
  }

  const standing = [
    { id: '00000000-0000-4000-c000-000000000004', title: 'Draft next week\'s roster and order', schedule: 'sun_20:00', last_run_at: iso(7 * 86_400_000) },
    { id: '00000000-0000-4000-c000-000000000005', title: 'Reconcile the weekend and flag anything odd', schedule: 'mon_07:00', last_run_at: iso(1 * 86_400_000) },
    { id: '00000000-0000-4000-c000-000000000006', title: 'Assemble the BAS pack for your accountant', schedule: 'quarterly', last_run_at: iso(20 * 86_400_000) },
  ]
  for (const s of standing) {
    const { error } = await db.from('aria_user_tasks').upsert({
      id: s.id, business_id: SIP_BUSINESS_ID, title: s.title, task_prompt: s.title,
      status: 'done', schedule: s.schedule, enabled: true, created_by: 'owner', notify_email: false,
      last_run_at: s.last_run_at,
    }, { onConflict: 'id' })
    if (error) console.error('[seed-owner-jobs] failed for', s.title, error.message)
    else console.log('[seed-owner-jobs] seeded standing job', s.title)
  }

  // Link the existing purchase_order decision to the job that produced it — inline in
  // action_data, no new FK column (see migration 20260729010000's header).
  const { data: existing } = await db.from('aria_autopilot_actions').select('action_data').eq('id', PURCHASE_ORDER_DECISION_ID).maybeSingle()
  await db.from('aria_autopilot_actions')
    .update({ action_data: { ...(existing?.action_data ?? {}), source_job_id: '00000000-0000-4000-c000-000000000002' } })
    .eq('id', PURCHASE_ORDER_DECISION_ID)

  // business_events — the spine those job lifecycles produce.
  const events = [
    { entity_id: '00000000-0000-4000-c000-000000000001', event_type: 'job_created', actor: 'owner', occurred_at: iso(6 * 60_000), payload_summary: { kind: 'supplier_comparison' } },
    { entity_id: '00000000-0000-4000-c000-000000000002', event_type: 'job_created', actor: 'owner', occurred_at: iso(2 * 3600_000), payload_summary: { kind: 'purchase_order_check' } },
    { entity_id: '00000000-0000-4000-c000-000000000002', event_type: 'job_completed', actor: 'cron', occurred_at: iso(110 * 60_000), payload_summary: { kind: 'purchase_order_check' } },
    { entity_id: '00000000-0000-4000-c000-000000000003', event_type: 'job_created', actor: 'owner', occurred_at: iso(40 * 60_000), payload_summary: { kind: 'xero_reconcile' } },
    { entity_id: '00000000-0000-4000-c000-000000000003', event_type: 'job_failed', actor: 'cron', occurred_at: iso(38 * 60_000), payload_summary: { kind: 'xero_reconcile' } },
    { entity_id: '00000000-0000-4000-c000-000000000004', event_type: 'job_created', actor: 'owner', occurred_at: iso(30 * 86_400_000), payload_summary: { kind: 'roster_and_order' } },
    { entity_id: '00000000-0000-4000-c000-000000000004', event_type: 'job_completed', actor: 'cron', occurred_at: iso(7 * 86_400_000), payload_summary: { kind: 'roster_and_order' } },
    { entity_id: '00000000-0000-4000-c000-000000000005', event_type: 'job_created', actor: 'owner', occurred_at: iso(30 * 86_400_000), payload_summary: { kind: 'weekend_reconcile' } },
    { entity_id: '00000000-0000-4000-c000-000000000005', event_type: 'job_completed', actor: 'cron', occurred_at: iso(1 * 86_400_000), payload_summary: { kind: 'weekend_reconcile' } },
    { entity_id: '00000000-0000-4000-c000-000000000006', event_type: 'job_created', actor: 'owner', occurred_at: iso(90 * 86_400_000), payload_summary: { kind: 'bas_pack' } },
    { entity_id: '00000000-0000-4000-c000-000000000006', event_type: 'job_completed', actor: 'cron', occurred_at: iso(20 * 86_400_000), payload_summary: { kind: 'bas_pack' } },
  ]
  for (const e of events) {
    const { error } = await db.from('business_events').insert({
      business_id: SIP_BUSINESS_ID, entity_type: 'job', entity_id: e.entity_id,
      event_type: e.event_type, actor: e.actor, payload_summary: e.payload_summary, occurred_at: e.occurred_at,
    })
    if (error && !error.message.includes('duplicate')) console.error('[seed-owner-jobs] event insert failed:', error.message)
  }
  const { error: decisionEventErr } = await db.from('business_events').insert({
    business_id: SIP_BUSINESS_ID, entity_type: 'decision', entity_id: PURCHASE_ORDER_DECISION_ID,
    event_type: 'proposed', actor: 'aria',
    payload_summary: { kind: 'purchase_order', domain: 'supply', amount_cents: 63500 },
    occurred_at: iso(110 * 60_000),
  })
  if (decisionEventErr) console.error('[seed-owner-jobs] decision event insert failed:', decisionEventErr.message)

  console.log('[seed-owner-jobs] done.')
}

main()
