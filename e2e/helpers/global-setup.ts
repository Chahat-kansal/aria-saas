import { chromium, type FullConfig } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { OWNER_STATE_PATH } from './session'
import { dbAdmin, hasDbAccess } from './supabase'

// CI-E2E-1 follow-up — see session.ts's own comment for the full incident (48 of 52 failures in
// the first real full-suite run were a single rate-limited-login cascade). This does two things,
// both scoped to what the specs actually need, not a general seeding pipeline:
// 1. Logs in ONCE, saves the session for every test to reuse (session.ts).
// 2. Seeds the state that was found masked behind the login cascade and would have caused (and
//    on re-run, did cause — see the POS terminal note below) a second wave of failures once login
//    was fixed: onboarding_complete (businesses default to false; /dashboard redirects to
//    /onboarding for an unfinished business), a small amount of real completed pos_sales (the
//    smoke-test fixture had zero — several specs assert a real $ revenue figure is visible), and
//    a pos_outlets row (see below).
// Idempotent — safe to run before every suite invocation, never accumulates duplicate seed rows.
export default async function globalSetup(config: FullConfig) {
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD
  if (!email || !password) {
    console.warn('[e2e/global-setup] TEST_USER_EMAIL/TEST_USER_PASSWORD not set — credentialed specs will skip via hasCredentials.')
    return
  }

  // ── Resolve the test business + seed what it needs BEFORE capturing the browser session ──────
  let businessId: string | null = null
  if (hasDbAccess && dbAdmin) {
    const { data: usersPage } = await dbAdmin.auth.admin.listUsers()
    const user = usersPage?.users.find(u => u.email === email)
    if (!user) {
      console.warn(`[e2e/global-setup] No auth user found for TEST_USER_EMAIL="${email}" — skipping seeding.`)
    } else {
      const { data: biz } = await dbAdmin.from('businesses')
        .select('id, onboarding_complete').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!biz) {
        console.warn('[e2e/global-setup] No business found for the test user — skipping seeding.')
      } else {
        businessId = biz.id as string

        if (biz.onboarding_complete !== true) {
          const { error } = await dbAdmin.from('businesses').update({ onboarding_complete: true }).eq('id', businessId)
          if (error) console.error('[e2e/global-setup] Failed to set onboarding_complete:', error.message)
          else console.log('[e2e/global-setup] onboarding_complete set true for', businessId)
        }

        // CI-E2E-1 follow-up (re-run finding) — the re-run's 4 POS terminal failures (.pos-product-
        // grid, .aria-pulse-rail, the search bar — everything downstream of POSShell's staff-bypass
        // gate) all trace to smoke-test-cafe having ZERO pos_outlets rows, despite onboarding_complete
        // now being true. That combination — "onboarded" but no outlet — isn't a realistic state for
        // a real business (every real onboarding flow creates at least one outlet), so seeding one
        // here is fixing the fixture to match reality, not routing around a real bug. Flagged
        // separately in the audit report as worth a defensive check: whether any real onboarding path
        // can currently leave a business in this same inconsistent state.
        const { count: outletCount } = await dbAdmin.from('pos_outlets')
          .select('id', { count: 'exact', head: true }).eq('business_id', businessId)
        if (!outletCount) {
          const { error } = await dbAdmin.from('pos_outlets').insert({ business_id: businessId, name: 'Main' })
          if (error) console.error('[e2e/global-setup] Failed to seed pos_outlets:', error.message)
          else console.log('[e2e/global-setup] Seeded 1 pos_outlets row for', businessId)
        }
      }
    }
  } else {
    console.warn('[e2e/global-setup] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — skipping onboarding/outlet/sales seeding (DB-dependent specs will fail or skip on their own gates).')
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

  // CI-E2E-1 follow-up (re-run finding) — this used to inject a made-up shape
  // ({role:'manager', permissions:{}}) that doesn't match ANY real login path. Now byte-for-byte
  // the same object POSShell.tsx's own bypassAsOwner() writes (src/components/pos/POSShell.tsx —
  // the real "Continue as owner" button's handler) — the one path in the app proven to produce a
  // fully-functional owner session, not a guess at what might satisfy the TTL check.
  await page.evaluate(() => {
    localStorage.setItem('aria_pos_user', JSON.stringify({
      id: 'owner', name: 'Owner', role: 'owner',
      permissions: { can_apply_discount: true, can_refund: true, max_discount_pct: 100, can_close_register: true, can_override_price: true },
      loginAt: Date.now(),
    }))
  })

  await page.context().storageState({ path: OWNER_STATE_PATH })
  await browser.close()
  console.log('[e2e/global-setup] Logged in once, session cached for the whole run.')

  if (!businessId || !dbAdmin) return

  // NOT seeded here — marked, not guessed at, per the audit's own instruction not to fabricate
  // fixtures without confirming a spec actually needs them. These specs assert against data this
  // business has none of; expect them to still fail (on real, honest assertions, not the login
  // cascade) until someone decides these need dedicated seeding:
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

  // CI-E2E-1 follow-up (re-run finding) — e2e/invoice.spec.ts's "send or email action" test opens
  // the blank NEW-invoice creation form and looks for a Send button there. Read src/app/dashboard/
  // invoices/page.tsx directly: Send only renders on an ALREADY-SAVED draft invoice's detail view
  // (`selected.status === 'draft'`, line ~395-401) — a genuinely different screen than the creation
  // form, which the test never actually reaches (it never saves anything). Fixed the test itself to
  // select a real invoice and check there; this seeds that invoice, tagged distinctively so the test
  // can find it by its own known invoice_number.
  const E2E_INVOICE_NUMBER = 'E2E-TEST-0001'
  const { count: invoiceCount } = await dbAdmin.from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId).eq('invoice_number', E2E_INVOICE_NUMBER)
  if (!invoiceCount) {
    const { error } = await dbAdmin.from('invoices').insert({
      business_id: businessId,
      invoice_number: E2E_INVOICE_NUMBER,
      bill_to_name: 'E2E Test Customer',
      status: 'draft',
    })
    if (error) console.error('[e2e/global-setup] Failed to seed invoices:', error.message)
    else console.log('[e2e/global-setup] Seeded 1 draft invoice for', businessId)
  }
}
