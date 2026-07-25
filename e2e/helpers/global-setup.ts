import { chromium, type FullConfig } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { OWNER_STATE_PATH } from './session'
import { dbAdmin, hasDbAccess } from './supabase'

// CI-E2E-1 follow-up — see session.ts's own comment for the full incident (48 of 52 failures in
// the first real full-suite run were a single rate-limited-login cascade). This does two things,
// both scoped to what the specs actually need, not a general seeding pipeline:
// 1. Logs in ONCE, saves the session for every test to reuse (session.ts).
// 2. Seeds the two pieces of state that were found masked behind the login cascade and would have
//    caused a SECOND wave of failures once login was fixed: onboarding_complete (businesses default
//    to false; /dashboard redirects to /onboarding for an unfinished business, breaking every
//    dashboard-content assertion) and a small amount of real completed pos_sales (the smoke-test
//    fixture business has zero — several specs assert a real $ revenue figure is visible).
// Idempotent — safe to run before every suite invocation, never accumulates duplicate seed rows.
export default async function globalSetup(config: FullConfig) {
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD
  if (!email || !password) {
    console.warn('[e2e/global-setup] TEST_USER_EMAIL/TEST_USER_PASSWORD not set — credentialed specs will skip via hasCredentials.')
    return
  }

  mkdirSync(dirname(OWNER_STATE_PATH), { recursive: true })
  const baseURL = (config.projects[0]?.use?.baseURL as string | undefined) ?? 'https://www.ariaos.site'

  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL } as never)
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('form').getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/dashboard|onboarding/, { timeout: 25_000 })

  // tests/e2e/fixtures/auth.ts's own POS-staff bypass, baked into the shared session so no
  // per-test injection is needed. POSShell requires 'aria_pos_user' in localStorage to render page
  // content instead of the PIN-entry screen.
  await page.evaluate(() => {
    localStorage.setItem('aria_pos_user', JSON.stringify({
      id: 'e2e-test-bypass', name: 'E2E Test', role: 'manager', permissions: {}, loginAt: Date.now(),
    }))
  })

  await page.context().storageState({ path: OWNER_STATE_PATH })
  await browser.close()
  console.log('[e2e/global-setup] Logged in once, session cached for the whole run.')

  // ── Seed what specs legitimately need, scoped to this session's own test business ──────────
  if (!hasDbAccess || !dbAdmin) {
    console.warn('[e2e/global-setup] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — skipping onboarding/sales seeding (DB-dependent specs will fail or skip on their own gates).')
    return
  }
  const { data: usersPage } = await dbAdmin.auth.admin.listUsers()
  const user = usersPage?.users.find(u => u.email === email)
  if (!user) { console.warn(`[e2e/global-setup] No auth user found for TEST_USER_EMAIL="${email}" — skipping seeding.`); return }

  const { data: biz } = await dbAdmin.from('businesses')
    .select('id, onboarding_complete').eq('user_id', user.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!biz) { console.warn('[e2e/global-setup] No business found for the test user — skipping seeding.'); return }
  const businessId = biz.id as string

  if (biz.onboarding_complete !== true) {
    const { error } = await dbAdmin.from('businesses').update({ onboarding_complete: true }).eq('id', businessId)
    if (error) console.error('[e2e/global-setup] Failed to set onboarding_complete:', error.message)
    else console.log('[e2e/global-setup] onboarding_complete set true for', businessId)
  }

  // NOT seeded here — marked, not guessed at, per the audit's own instruction not to fabricate
  // fixtures without confirming a spec actually needs them. These specs assert against data this
  // business has none of; expect them to still fail (on real, honest assertions, not the login
  // cascade) until someone decides these need dedicated seeding:
  //   - e2e/invoice.spec.ts — needs real invoice rows (table untouched by any seed script)
  //   - e2e/community.spec.ts ("liking a post…", "creating a text post…") — needs an existing post
  //     to interact with; smoke-test-cafe has zero community_posts by design (is_test-excluded)
  //   - e2e/loyalty-scan.spec.ts — needs phone-searchable pos_customers rows
  //   - tests/e2e/05-reports.spec.ts (cashier/commission reports) — needs sales with served_by set;
  //     the 3 seeded below have no staff attribution
  //   - tests/e2e/06-orders.spec.ts (Smart Order Builder) — needs supplier/purchase-order fixtures,
  //     unrelated to sales entirely

  const { count: saleCount } = await dbAdmin.from('pos_sales')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId).eq('status', 'completed')
  if (!saleCount) {
    const now = new Date()
    const rows = [45.5, 12.0, 78.9].map((total, i) => ({
      business_id: businessId,
      total_amount: total,
      status: 'completed',
      notes: 'e2e-global-setup-seed',
      created_at: new Date(now.getTime() - i * 3_600_000).toISOString(),
    }))
    const { error } = await dbAdmin.from('pos_sales').insert(rows)
    if (error) console.error('[e2e/global-setup] Failed to seed pos_sales:', error.message)
    else console.log('[e2e/global-setup] Seeded 3 completed pos_sales for', businessId)
  }
}
