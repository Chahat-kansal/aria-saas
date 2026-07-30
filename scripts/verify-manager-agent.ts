/**
 * MANAGER-AGENT-1 — proof harness for the authority boundary and the review pass.
 *
 * Runs PURE logic only (no DB, no env, no network) so the guarantees can be verified anywhere,
 * including CI. The two things worth proving are both pure:
 *   - the authority test refuses marked actions (this is the whole safety claim)
 *   - the review pass catches the named failure classes that have shipped to real owners before
 *
 * Run: npx tsx scripts/verify-manager-agent.ts
 */
import { assertSafeToActAlone, canActAlone, AuthorityViolation } from '../src/lib/manager/authority'
import { reviewProposal } from '../src/lib/manager/review'
import type { HealthSignals } from '../src/lib/aria/health-signals'

let pass = 0, fail = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log('  PASS  ' + label + (detail ? '  — ' + detail : '')) }
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  — ' + detail : '')) }
}

// A dormant business: no sales this week, insufficient sample. The exact state that produced the
// "your revenue collapsed" false alarm this review pass exists to prevent.
const DORMANT: HealthSignals = {
  pos_health: {
    status: 'INSUFFICIENT_SAMPLE', payment_coverage_pct: null, last_sale_recorded_at: null,
    last_sync_at: null, hours_since_last_sale: null, completed_sales_7d: 0,
    wiring_health_status: null, reasoning: 'no sales in sample window',
  },
  day_of_week_context: {
    today_dow: 'Monday', today_baseline_revenue: null, today_baseline_rank: null,
    actual_revenue_so_far: 0, deviation_from_baseline_pct: null, reasoning: 'no baseline',
  },
  weather_context: { available: false, reason: 'not configured' },
  data_freshness: { last_pos_sync_at: null, last_action_executed_at: null, stale_signals_count: 0, reasoning: 'n/a' },
  known_unknowns: [],
  _anchor_numbers: [1284, 138],
  computed_at: new Date().toISOString(),
}

const TRADING: HealthSignals = {
  ...DORMANT,
  pos_health: { ...DORMANT.pos_health, status: 'OK', completed_sales_7d: 138 },
}

console.log('\n=== MANAGER-AGENT-1 proof ===\n')

// ── PROOF 1: a marked action CANNOT be taken alone ───────────────────────────────────────────
console.log('PROOF 1 — the authority boundary (no marked action can bypass the owner tap)')
const marked = [
  { action_kind: 'pay_supplier', summary: 'Pay an invoice', is_invisible: false, is_reversible: false, is_zero_cost: false, touches: ['money' as const] },
  { action_kind: 'sms_customer', summary: 'Text a customer', is_invisible: false, is_reversible: false, is_zero_cost: true, touches: ['customer' as const] },
  { action_kind: 'publish_roster', summary: 'Publish the roster', is_invisible: false, is_reversible: true, is_zero_cost: true, touches: ['roster' as const] },
  { action_kind: 'post_social', summary: 'Post publicly', is_invisible: false, is_reversible: false, is_zero_cost: true, touches: ['external' as const] },
  { action_kind: 'silent_but_costly', summary: 'Invisible but spends', is_invisible: true, is_reversible: true, is_zero_cost: false, touches: [] },
  { action_kind: 'silent_irreversible', summary: 'Invisible but permanent', is_invisible: true, is_reversible: false, is_zero_cost: true, touches: [] },
]
for (const m of marked) {
  let threw = false
  try { assertSafeToActAlone(m) } catch (e) { threw = e instanceof AuthorityViolation }
  check('REFUSED: ' + m.action_kind, threw && !canActAlone(m))
}

// ── PROOF 2: the safe class IS allowed ───────────────────────────────────────────────────────
console.log('\nPROOF 2 — the safe class (invisible + reversible + free + unmarked) is permitted')
const safe = {
  action_kind: 'manager_review_pass',
  summary: 'Reviewed 4 proposals: 2 approved, 2 sent back.',
  is_invisible: true, is_reversible: true, is_zero_cost: true, touches: [] as never[],
}
let safeThrew = false
try { assertSafeToActAlone(safe) } catch { safeThrew = true }
check('permitted: manager_review_pass', !safeThrew && canActAlone(safe))

// ── PROOF 3: the review pass catches the named failure classes ───────────────────────────────
console.log('\nPROOF 3 — review catches what has shipped to real owners before')

const invented = reviewProposal(
  { agent_type: 'pricing', title: 'Revenue target missed', body: 'You are $999999 below your target this month.' },
  { health: TRADING, anchors: [1284, 138], seenTitles: new Set() },
)
check('invented figure REJECTED (not shown to owner)', invented.verdict === 'rejected' && invented.reason_code === 'invented_figure', invented.reason_detail ?? '')

const catastrophe = reviewProposal(
  { agent_type: 'flash_revenue', title: 'Revenue collapse', body: 'Sales have collapsed — urgent action required.' },
  { health: DORMANT, anchors: [], seenTitles: new Set() },
)
check('dormant-not-broken REJECTED', catastrophe.verdict === 'rejected' && catastrophe.reason_code === 'dormant_not_broken', catastrophe.reason_detail ?? '')

const scaffold = reviewProposal(
  { agent_type: 'briefing', title: 'Daily note', body: 'DO NOT open with a greeting (max 1) and avoid prior briefings.' },
  { health: TRADING, anchors: [], seenTitles: new Set() },
)
check('scaffold leak REJECTED', scaffold.verdict === 'rejected' && scaffold.reason_code === 'scaffold_leak')

const seen = new Set<string>()
const first = reviewProposal({ agent_type: 'reorder', title: 'Low stock on milk', body: 'Reorder milk.' }, { health: TRADING, anchors: [], seenTitles: seen })
const dup = reviewProposal({ agent_type: 'inventory', title: 'Low stock on milk', body: 'Reorder milk.' }, { health: TRADING, anchors: [], seenTitles: seen })
check('first proposal APPROVED', first.verdict === 'approved')
check('duplicate REJECTED', dup.verdict === 'rejected' && dup.reason_code === 'duplicate')

// ── PROOF 4: a legitimate proposal survives (and is therefore owner-gated) ───────────────────
console.log('\nPROOF 4 — a legitimate proposal survives review and goes to the owner gate')
const legit = reviewProposal(
  { agent_type: 'bas', title: 'BAS due in 12 days', body: 'Your BAS is due soon. Log in to review.' },
  { health: TRADING, anchors: [1284, 138], seenTitles: new Set() },
)
check('legit proposal APPROVED (→ createDecision → owner tap)', legit.verdict === 'approved')

console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===\n')
process.exit(fail > 0 ? 1 : 0)
