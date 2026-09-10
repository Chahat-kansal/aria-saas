/**
 * CI-E2E-1 — idempotent seed script for the e2e test suite.
 *
 * Provisions the "Sip" test business + one staff member + two products +
 * one loyalty reward, all keyed off fixed UUIDs so re-running this script
 * (every CI run) upserts the same rows instead of accumulating duplicates.
 *
 * Requires:
 *   SUPABASE_URL               — the TEST Supabase project URL (never prod)
 *   SUPABASE_SERVICE_ROLE_KEY  — service-role key for that TEST project
 *   TEST_USER_EMAIL            — must already exist as a real Supabase Auth
 *                                 user in that project (create once via the
 *                                 Supabase dashboard or Admin API — this
 *                                 script provisions business data, not the
 *                                 auth user itself, since /login in the e2e
 *                                 specs needs real Supabase Auth credentials
 *                                 to sign in with TEST_USER_PASSWORD).
 *
 * Run: npx tsx e2e/helpers/seed.ts
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? ''

// Fixed UUIDs — idempotency key for every row this script writes. Never reuse
// these in real data; they exist only so re-seeding always targets the same rows.
// S6 phase 1 — imported, not re-declared. The seed and the resolver disagreeing about which
// business this is cost the e2e suite two months of testing the wrong one.
import { SEEDED_TEST_BUSINESS_ID } from './test-business'
const SIP_BUSINESS_ID = SEEDED_TEST_BUSINESS_ID
const SIP_STAFF_ID = '00000000-0000-4000-a000-000000000002'
const SIP_PRODUCT_1_ID = '00000000-0000-4000-a000-000000000003'
const SIP_PRODUCT_2_ID = '00000000-0000-4000-a000-000000000004'
const SIP_REWARD_ID = '00000000-0000-4000-a000-000000000005'
// MS8 phase 5 — fixed UUIDs so the seed stays idempotent across runs, same as every id above.
const SIP_OUTLET_ID = '00000000-0000-4000-a000-000000000006'
const SIP_REGISTER_ID = '00000000-0000-4000-a000-000000000007'
const SIP_SESSION_ID = '00000000-0000-4000-a000-000000000008'
const SIP_SLUG = 'sip-e2e-test'
// S6 phase 1 — three completed sales, so the fixture can answer a question about money. Fixed
// UUIDs keep it idempotent; the timestamps are refreshed to TODAY on every run so a "what did we
// take today" question has a real answer rather than one that ages out overnight.
const SIP_SALE_1_ID = '00000000-0000-4000-a000-000000000009'
const SIP_SALE_2_ID = '00000000-0000-4000-a000-00000000000a'
const SIP_SALE_3_ID = '00000000-0000-4000-a000-00000000000b'
const SIP_LINE_1_ID = '00000000-0000-4000-a000-00000000000c'
const SIP_LINE_2_ID = '00000000-0000-4000-a000-00000000000d'
const SIP_LINE_3_ID = '00000000-0000-4000-a000-00000000000e'
/** What the three sales below add up to. The live check asserts against this exact figure. */
export const SEEDED_TODAY_REVENUE = 22.5

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[seed] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required — aborting.')
    process.exit(1)
  }
  if (!TEST_USER_EMAIL) {
    console.error('[seed] TEST_USER_EMAIL is required — aborting.')
    process.exit(1)
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  const { data: usersPage, error: listErr } = await db.auth.admin.listUsers()
  if (listErr) {
    console.error('[seed] Failed to list auth users:', listErr.message)
    process.exit(1)
  }
  const user = usersPage.users.find(u => u.email === TEST_USER_EMAIL)
  if (!user) {
    console.error(
      `[seed] No Supabase Auth user found for TEST_USER_EMAIL="${TEST_USER_EMAIL}". ` +
      'Create this user once (dashboard or Admin API) in the TEST Supabase project before running the suite — ' +
      'seeding business data alone cannot create a working login.',
    )
    process.exit(1)
  }

  console.log(`[seed] Resolved TEST_USER_EMAIL to user_id=${user.id}`)

  const { error: bizErr } = await db.from('businesses').upsert({
    id: SIP_BUSINESS_ID,
    user_id: user.id,
    name: 'Sip (E2E Test)',
    slug: SIP_SLUG,
    industry: 'cafe',
    business_model: 'product',
    is_active: true,
    // MS8 phase 5 — WITHOUT THIS, authenticated traffic routes to the onboarding wizard instead of
    // the dashboard, and every logged-in spec asserts against the wrong page.
    onboarding_complete: true,
  }, { onConflict: 'id' })
  if (bizErr) { console.error('[seed] businesses upsert failed:', bizErr.message); process.exit(1) }
  console.log('[seed] Sip test business ready')

  const { error: staffErr } = await db.from('staff_members').upsert({
    id: SIP_STAFF_ID,
    business_id: SIP_BUSINESS_ID,
    first_name: 'Test',
    last_name: 'Barista',
    position: 'Barista',
    employment_type: 'casual',
    status: 'active',
  }, { onConflict: 'id' })
  if (staffErr) { console.error('[seed] staff_members upsert failed:', staffErr.message); process.exit(1) }
  console.log('[seed] 1 staff member ready')

  const { error: productsErr } = await db.from('pos_products').upsert([
    { id: SIP_PRODUCT_1_ID, business_id: SIP_BUSINESS_ID, name: 'Flat White', price: 5.5, cost_price: 1.8, is_active: true },
    { id: SIP_PRODUCT_2_ID, business_id: SIP_BUSINESS_ID, name: 'Croissant', price: 6.0, cost_price: 2.1, is_active: true },
  ], { onConflict: 'id' })
  if (productsErr) { console.error('[seed] pos_products upsert failed:', productsErr.message); process.exit(1) }
  console.log('[seed] 2 products ready')

  const { error: rewardErr } = await db.from('loyalty_offers').upsert({
    id: SIP_REWARD_ID,
    business_id: SIP_BUSINESS_ID,
    title: 'Free coffee after 10 stamps',
    description: 'Collect 10 stamps, get your next coffee free.',
    offer_type: 'reward',
    point_cost: 10,
    active: true,
  }, { onConflict: 'id' })
  if (rewardErr) { console.error('[seed] loyalty_offers upsert failed:', rewardErr.message); process.exit(1) }
  console.log('[seed] 1 reward ready')

  // Loyalty must actually be ON for the reward to be visible anywhere real —
  // same canonical field the rest of the app reads (pos_loyalty_config.program_enabled).
  const { error: loyaltyCfgErr } = await db.from('pos_loyalty_config').upsert({
    business_id: SIP_BUSINESS_ID,
    program_enabled: true,
  }, { onConflict: 'business_id' })
  if (loyaltyCfgErr) { console.error('[seed] pos_loyalty_config upsert failed:', loyaltyCfgErr.message); process.exit(1) }

  // ── MS8 PHASE 5 — THE STATE THE POS SPECS NEED, CREATED RATHER THAN ASSUMED ──────────────────
  //
  // Before this, seed.ts created a business, staff, products and loyalty — and nothing that lets
  // the POS terminal open. Zero references to pos_outlets, pos_registers, pos_cash_sessions or
  // onboarding_complete. The suite only ever reached the terminal because `…0101` happened to
  // carry an ORPHANED open cash session, opened by hand on 1 Aug, that nobody created deliberately
  // and nothing recreates. A fixture propped up by residue is not a fixture.
  //
  // Each of these is load-bearing for a specific gate:
  //   outlet   — resolveOutletId returns null without one; every count/stocktake path then fails
  //   register — a cash session needs somewhere to belong
  //   session  — terminal/page.tsx: `registerIsOpen = !!registerSession`, and the product grid is
  //              behind that gate. No open session, no grid, no POS spec gets past the first
  //              assertion.
  const { error: outletErr } = await db.from('pos_outlets').upsert({
    id: SIP_OUTLET_ID,
    business_id: SIP_BUSINESS_ID,
    name: 'Sip Main',
    is_default: true,
    is_active: true,
  }, { onConflict: 'id' })
  if (outletErr) { console.error('[seed] pos_outlets upsert failed:', outletErr.message); process.exit(1) }
  console.log('[seed] 1 outlet ready')

  const { error: regErr } = await db.from('pos_registers').upsert({
    id: SIP_REGISTER_ID,
    business_id: SIP_BUSINESS_ID,
    outlet_id: SIP_OUTLET_ID,
    name: 'Register 1',
  }, { onConflict: 'id' })
  if (regErr) { console.error('[seed] pos_registers upsert failed:', regErr.message); process.exit(1) }
  console.log('[seed] 1 register ready')

  // Re-opened on every run: a previous run's suite may have closed it (the smoke POS test is
  // self-cleaning), and a closed session silently puts every POS spec back behind the gate.
  // Upsert-by-id keeps it idempotent rather than accumulating a session per run.
  const { error: sessErr } = await db.from('pos_cash_sessions').upsert({
    id: SIP_SESSION_ID,
    business_id: SIP_BUSINESS_ID,
    register_id: SIP_REGISTER_ID,
    status: 'open',
    opened_at: new Date().toISOString(),
    closed_at: null,
    opening_float: 200,
  }, { onConflict: 'id' })
  if (sessErr) { console.error('[seed] pos_cash_sessions upsert failed:', sessErr.message); process.exit(1) }
  console.log('[seed] register session open')

  // ── S6 PHASE 1 — SALES, WHICH THE FIXTURE HAS NEVER HAD ──────────────────────────────────────
  //
  // Without these the seeded business has $0.00 of revenue, so every question about money is
  // unanswerable and a live check asking one would be asserting on an empty answer — which is
  // exactly the shape this sprint exists to end. 1x Flat White + 1x Croissant + 2x Flat White
  // = $22.50, and SEEDED_TODAY_REVENUE is the single place that number is written down.
  //
  // Dated to NOW on every run: a fixture whose sales are always "yesterday" answers "what did we
  // take today" with zero, and the check would then be asserting on the wrong kind of nothing.
  const now = new Date().toISOString()
  const { error: salesErr } = await db.from('pos_sales').upsert([
    { id: SIP_SALE_1_ID, business_id: SIP_BUSINESS_ID, outlet_id: SIP_OUTLET_ID, sale_number: 'E2E-0001',
      total_amount: 5.5, payment_method: 'card', status: 'completed', created_at: now },
    { id: SIP_SALE_2_ID, business_id: SIP_BUSINESS_ID, outlet_id: SIP_OUTLET_ID, sale_number: 'E2E-0002',
      total_amount: 6.0, payment_method: 'cash', status: 'completed', created_at: now },
    { id: SIP_SALE_3_ID, business_id: SIP_BUSINESS_ID, outlet_id: SIP_OUTLET_ID, sale_number: 'E2E-0003',
      total_amount: 11.0, payment_method: 'card', status: 'completed', created_at: now },
  ], { onConflict: 'id' })
  if (salesErr) { console.error('[seed] pos_sales upsert failed:', salesErr.message); process.exit(1) }

  const { error: linesErr } = await db.from('pos_sale_items').upsert([
    { id: SIP_LINE_1_ID, sale_id: SIP_SALE_1_ID, business_id: SIP_BUSINESS_ID, product_id: SIP_PRODUCT_1_ID,
      product_name: 'Flat White', quantity: 1, unit_price: 5.5, line_total: 5.5, created_at: now },
    { id: SIP_LINE_2_ID, sale_id: SIP_SALE_2_ID, business_id: SIP_BUSINESS_ID, product_id: SIP_PRODUCT_2_ID,
      product_name: 'Croissant', quantity: 1, unit_price: 6.0, line_total: 6.0, created_at: now },
    { id: SIP_LINE_3_ID, sale_id: SIP_SALE_3_ID, business_id: SIP_BUSINESS_ID, product_id: SIP_PRODUCT_1_ID,
      product_name: 'Flat White', quantity: 2, unit_price: 5.5, line_total: 11.0, created_at: now },
  ], { onConflict: 'id' })
  if (linesErr) { console.error('[seed] pos_sale_items upsert failed:', linesErr.message); process.exit(1) }
  console.log('[seed] 3 completed sales ready — $' + SEEDED_TODAY_REVENUE.toFixed(2) + ' today')

  console.log('[seed] Done — Sip test business fully seeded and idempotent.')
  console.log(`[seed] TEST_BUSINESS_ID should be ${SIP_BUSINESS_ID}`)
}

main().catch(e => { console.error('[seed] Unexpected error:', e); process.exit(1) })
