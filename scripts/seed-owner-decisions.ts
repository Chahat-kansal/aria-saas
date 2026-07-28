/**
 * OWNER-APP PH-1 — dev-only seed for the decision registry (aria_autopilot_actions).
 *
 * Inserts 9 owner_decisions across all 5 domains for Sip Café (3 money/2 people/2 growth/
 * 1 supply/1 compliance, matching the locked mockup's own "All 9" example set) so the
 * Today/Decisions screens render real data. Idempotent — keyed off fixed UUIDs, safe to re-run
 * (upserts, never accumulates duplicates). NEVER runs in the prod path — this is a standalone
 * script the founder runs by hand in dev, guarded by NODE_ENV, matching e2e/helpers/seed.ts's own
 * convention.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (dev project, never prod).
 * Run: npx tsx scripts/seed-owner-decisions.ts
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SIP_BUSINESS_ID = 'ff5055a0-c351-4ada-817a-1804961035f3'

// Fixed UUIDs — idempotency key for every row this script writes.
const ROWS = [
  {
    id: '00000000-0000-4000-b000-000000000001', domain: 'money', kind: 'supplier_bills',
    title: '3 supplier bills due this week', subtitle: 'Roasted & Ready, Dairy Direct, Fresh Produce Co',
    amount_cents: 184250, requires_stepup: true,
    aria_reason: 'These are the 3 bills with a due date in the next 7 days, pulled from your supplier invoices.',
    payload: { rows: [
      { supplier: 'Roasted & Ready', due: '2026-08-02', amount_cents: 92000 },
      { supplier: 'Dairy Direct', due: '2026-08-03', amount_cents: 41250 },
      { supplier: 'Fresh Produce Co', due: '2026-08-04', amount_cents: 51000 },
    ] },
  },
  {
    id: '00000000-0000-4000-b000-000000000002', domain: 'money', kind: 'pay_run',
    title: 'Approve this week\'s pay run', subtitle: '6 staff, week ending 2026-08-02',
    amount_cents: 412000, requires_stepup: true,
    aria_reason: 'Hours pulled from pos_timesheets for the week ending 2026-08-02, at each staff member\'s pay_rate_cents.',
    payload: { diff: { before: 'unpaid', after: 'paid' }, staff_count: 6 },
  },
  {
    id: '00000000-0000-4000-b000-000000000009', domain: 'money', kind: 'invoice_chase',
    title: 'Chase 4 unpaid invoices', subtitle: 'Catering accounts · 30–58 days overdue',
    amount_cents: 214000, requires_stepup: true,
    aria_reason: 'These 4 catering invoices are more than 30 days past their due date, pulled from invoices.status.',
    payload: { rows: [
      { account: 'Fitzroy Films', days_overdue: 58, amount_cents: 84000 },
      { account: 'North Park Studio', days_overdue: 45, amount_cents: 62000 },
      { account: 'Collingwood Co-work', days_overdue: 38, amount_cents: 41000 },
      { account: 'The Gasworks', days_overdue: 30, amount_cents: 27000 },
    ] },
  },
  {
    id: '00000000-0000-4000-b000-000000000003', domain: 'people', kind: 'roster_publish',
    title: 'Publish next week\'s roster', subtitle: 'Mon 4 Aug – Sun 10 Aug',
    amount_cents: null, requires_stepup: false,
    aria_reason: 'Draft roster built from last 4 weeks\' average shift coverage; no clashes or unavailability conflicts found.',
    payload: { diff: { before: 'draft', after: 'published' } },
  },
  {
    id: '00000000-0000-4000-b000-000000000004', domain: 'people', kind: 'leave_request',
    title: 'Leave request — Jordan, 12–14 Aug', subtitle: '3 days annual leave',
    amount_cents: null, requires_stepup: false,
    aria_reason: 'No roster conflict found for the requested dates — 2 other staff already scheduled those shifts.',
    payload: { rows: [{ staff: 'Jordan', dates: '2026-08-12 to 2026-08-14', type: 'annual' }] },
  },
  {
    id: '00000000-0000-4000-b000-000000000005', domain: 'growth', kind: 'reel_schedule',
    title: 'Schedule 3 reels for next week', subtitle: 'New menu items + weekend special',
    amount_cents: null, requires_stepup: false,
    aria_reason: 'Drafted from this week\'s top-selling new products; no reels currently scheduled for next week.',
    payload: { rows: [{ topic: 'New menu items' }, { topic: 'Weekend special' }, { topic: 'Behind the counter' }] },
  },
  {
    id: '00000000-0000-4000-b000-000000000006', domain: 'growth', kind: 'winback_campaign',
    title: 'Winback campaign — 42 lapsed customers', subtitle: 'No visit in 45+ days',
    amount_cents: null, requires_stepup: false,
    aria_reason: '42 customers with no pos_sales row in the last 45 days, pulled from pos_customers.last_visit_at.',
    payload: { target_count: 42 },
  },
  {
    id: '00000000-0000-4000-b000-000000000007', domain: 'supply', kind: 'purchase_order',
    title: 'Purchase order — low stock on 5 items', subtitle: 'Milk, coffee beans, cups, oat milk, syrup',
    amount_cents: 63500, requires_stepup: false,
    aria_reason: 'These 5 products are below their reorder_point in pos_products, using your default supplier prices.',
    payload: { rows: [
      { product: 'Milk (full cream)', qty: 20 }, { product: 'Coffee beans (house blend)', qty: 10 },
      { product: 'Cups (12oz)', qty: 500 }, { product: 'Oat milk', qty: 15 }, { product: 'Vanilla syrup', qty: 6 },
    ] },
  },
  {
    id: '00000000-0000-4000-b000-000000000008', domain: 'compliance', kind: 'food_safety_signoff',
    title: 'Weekly food safety sign-off due', subtitle: 'Fridge temps + cleaning log, week ending 2026-08-02',
    amount_cents: null, requires_stepup: false,
    aria_reason: 'Your food safety plan requires a weekly owner/manager sign-off — this week\'s checklist is complete and ready to review.',
    payload: { diff: { before: 'unsigned', after: 'signed' } },
  },
] as const

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[seed-owner-decisions] refusing to run with NODE_ENV=production — aborting.')
    process.exit(1)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[seed-owner-decisions] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required — aborting.')
    process.exit(1)
  }
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  for (const row of ROWS) {
    const { error } = await db.from('aria_autopilot_actions').upsert({
      id: row.id, business_id: SIP_BUSINESS_ID, domain: row.domain, kind: row.kind,
      title: row.title, description: row.subtitle, amount_cents: row.amount_cents,
      requires_stepup: row.requires_stepup, action_data: row.payload, reasoning: row.aria_reason,
      status: 'pending', created_by: 'aria', priority: 'important',
    }, { onConflict: 'id' })
    if (error) console.error('[seed-owner-decisions] failed for', row.kind, error.message)
    else console.log('[seed-owner-decisions] seeded', row.domain, '/', row.kind)
  }
}

main()
