import { test, expect, type Page } from '@playwright/test'
import { dbAdmin, hasDbAccess } from './helpers/supabase'
import { LIQUOR_FIXTURE_NAME, LIQUOR_FIXTURE_EMAIL, LIQUOR_FIXTURE_PASSWORD, findLiquorFixtureId } from './helpers/test-business'

/**
 * ONBOARD-WIZARD-1 — "Aria Test Liquor" is the permanent retail/liquor test
 * fixture created via a real fresh onboard through the rebuilt 4-step
 * wizard (Sip Café's product/POS + liquor-feature-set twin). This spec is
 * find-or-create and idempotent: it NEVER deletes or recreates the fixture
 * if it already exists (resolved by name via findLiquorFixtureId) — it only
 * creates it once, the first time this suite ever runs against a database
 * that doesn't have it yet (e.g. a fresh Supabase project). Every other run
 * just re-asserts the same known-good rows.
 */

async function driveOnboardingWizard(page: Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(LIQUOR_FIXTURE_EMAIL)
  await page.locator('input[type="password"]').fill(LIQUOR_FIXTURE_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/onboarding|dashboard/, { timeout: 20_000 })
  if (!page.url().includes('/onboarding')) await page.goto('/onboarding')

  // WELCOME
  await page.waitForSelector('text=Get started', { timeout: 15_000 })
  await page.getByText('Get started', { exact: false }).click()

  // DETAILS
  await page.waitForSelector('text=Tell us about your business', { timeout: 10_000 })
  await page.locator('input[placeholder="e.g. Global Liquor"]').fill(LIQUOR_FIXTURE_NAME)
  await page.locator('input[placeholder="Owner / manager"]').fill('Aria Test Fixture Owner')
  await page.getByText('We sell products', { exact: false }).click()
  await page.waitForSelector('select', { timeout: 5_000 })
  await page.locator('select').first().selectOption('liquor')
  // Real Geoapify autocomplete when available; manual fallback otherwise —
  // either is a legitimate real user path, matching AddressAutocomplete's design.
  const addrInput = page.locator('input[placeholder="Start typing your street address…"]')
  let usedAutocomplete = false
  if (await addrInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await addrInput.fill('251 Bourke Street, Melbourne')
    await page.waitForTimeout(1_200)
    const firstSuggestion = page.locator('ul li button').first()
    if (await firstSuggestion.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await firstSuggestion.click()
      usedAutocomplete = true
    }
  }
  if (!usedAutocomplete) {
    const manualLink = page.getByText('Enter manually', { exact: false })
    if (await manualLink.isVisible({ timeout: 3_000 }).catch(() => false)) await manualLink.click()
    await page.locator('input[placeholder="123 Example St"]').fill('251 Bourke Street')
    await page.locator('input[placeholder="Sydney"]').fill('Melbourne')
    await page.locator('select').nth(1).selectOption('VIC')
    await page.locator('input[placeholder="2000"]').fill('3000')
  }
  // year_established must be a real value, not blank — an empty string 500s
  // on submit (businesses.year_established is an integer column; see the
  // ONBOARD-WIZARD-1 fix in api/onboarding/submit/route.ts).
  const moreDetails = page.getByText('+ Add more details (optional)', { exact: false })
  if (await moreDetails.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await moreDetails.click()
    await page.locator('input[placeholder="2018"]').fill('2020')
  }
  await page.getByRole('button', { name: 'Continue' }).click()

  // FEATURES — sensible industry defaults, just accept them.
  await page.waitForSelector('text=You can change any of this later', { timeout: 10_000 })
  await page.getByRole('button', { name: 'Continue' }).click()

  // PRODUCTS — at least 1 required for a product/POS business.
  await page.waitForSelector('text=Add your first products', { timeout: 10_000 })
  if (await page.locator('input[placeholder="e.g. Flat White"]').count() === 0) {
    await page.getByRole('button', { name: '+ Add a product manually' }).click()
    await page.locator('input[placeholder="e.g. Flat White"]').first().fill('Test Craft Beer 6-pack')
    await page.locator('input[placeholder="5.50"]').first().fill('24.99')
    await page.locator('input[placeholder="e.g. Coffee"]').first().fill('Beer')
  }
  await page.getByRole('button', { name: 'Finish setup' }).click()
  await page.waitForURL(/provisioning|review/, { timeout: 20_000 })
}

test.describe('Aria Test Liquor fixture — find-or-create, idempotent', () => {
  test.skip(!hasDbAccess, 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run this suite')

  let businessId: string | null = null

  test.beforeAll(async ({ browser }) => {
    businessId = await findLiquorFixtureId()
    if (businessId) return // already exists — nothing to create, ever.

    if (!dbAdmin) return
    const { data: existingUser } = await dbAdmin.auth.admin.listUsers()
    let userId = existingUser?.users?.find(u => u.email === LIQUOR_FIXTURE_EMAIL)?.id
    if (!userId) {
      const { data: created, error } = await dbAdmin.auth.admin.createUser({
        email: LIQUOR_FIXTURE_EMAIL, password: LIQUOR_FIXTURE_PASSWORD, email_confirm: true,
      })
      if (error) throw new Error('Could not create the liquor fixture auth user: ' + error.message)
      userId = created.user.id
    }

    const page = await browser.newPage()
    try {
      await driveOnboardingWizard(page)
    } finally {
      await page.close()
    }
    businessId = await findLiquorFixtureId()
  })

  test('exists with a NOT NULL slug and industry=liquor', async () => {
    test.skip(!businessId, 'Fixture could not be found or created')
    if (!dbAdmin || !businessId) return
    const { data } = await dbAdmin.from('businesses')
      .select('slug, industry, business_model, pos_enabled, onboarding_complete')
      .eq('id', businessId).maybeSingle()
    expect(data).not.toBeNull()
    expect(data!.slug).toBeTruthy()
    expect(data!.industry).toBe('liquor')
    expect(data!.business_model).toBe('product')
    expect(data!.pos_enabled).toBe(true)
    expect(data!.onboarding_complete).toBe(true)
  })

  test('has real liquor categories, not the generic Products/Services fallback', async () => {
    test.skip(!businessId, 'Fixture could not be found or created')
    if (!dbAdmin || !businessId) return
    const { data } = await dbAdmin.from('pos_categories').select('name').eq('business_id', businessId)
    const names = (data ?? []).map((c: { name: string }) => c.name)
    expect(names).toEqual(expect.arrayContaining(['Wine', 'Beer', 'Spirits']))
    expect(names).not.toEqual(expect.arrayContaining(['Products', 'Services']))
  })

  test('has an outlet and AU tax codes seeded', async () => {
    test.skip(!businessId, 'Fixture could not be found or created')
    if (!dbAdmin || !businessId) return
    const { data: outlets } = await dbAdmin.from('pos_outlets').select('id').eq('business_id', businessId)
    expect((outlets ?? []).length).toBeGreaterThan(0)
    const { data: tax } = await dbAdmin.from('pos_tax_codes').select('code').eq('business_id', businessId)
    const codes = (tax ?? []).map((t: { code: string }) => t.code)
    expect(codes).toEqual(expect.arrayContaining(['GST']))
  })

  test('has real, active products (not empty)', async () => {
    test.skip(!businessId, 'Fixture could not be found or created')
    if (!dbAdmin || !businessId) return
    const { data } = await dbAdmin.from('pos_products').select('name').eq('business_id', businessId).eq('is_active', true)
    expect((data ?? []).length).toBeGreaterThan(0)
  })
})
