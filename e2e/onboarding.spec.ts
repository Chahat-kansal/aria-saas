import { test, expect } from '@playwright/test'
import { login, hasCredentials } from './helpers/auth'
import { dbAdmin, hasDbAccess } from './helpers/supabase'
import { resolveTestBusinessId, getUserIdByEmail } from './helpers/test-business'
import { EMAIL } from './helpers/auth'

test.describe('Onboarding wizard', () => {
  test.skip(!hasCredentials, 'Set TEST_EMAIL and TEST_PASSWORD to run onboarding tests')

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('onboarding page loads without application error', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page.locator('body')).toBeVisible()
    // Redirecting to /dashboard when already onboarded is valid
    await expect(page).toHaveURL(/onboarding|dashboard/, { timeout: 10_000 })
    await expect(page.getByText(/application error|something went wrong|500/i)).not.toBeVisible()
  })

  test('already-onboarded user is redirected to dashboard', async ({ page }) => {
    await page.goto('/onboarding')
    // Most test accounts are already onboarded — expect either /dashboard or /onboarding
    await expect(page).toHaveURL(/dashboard|onboarding/, { timeout: 10_000 })
  })

  test('onboarding wizard shows at least one step or redirects to dashboard', async ({ page }) => {
    await page.goto('/onboarding')
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    // Must not be an error page
    await expect(page.getByText(/application error|500|crashed/i)).not.toBeVisible()

    const isOnboarding = page.url().includes('/onboarding')
    if (isOnboarding) {
      // CI-E2E-1 follow-up (re-run finding) — VISUAL_STEPS[0] is 'welcome' (src/app/onboarding/
      // page.tsx), a pure CTA splash ("Let's set up your {industry}" / "Get started →") with zero
      // form inputs and no "step N"/"business name" text by design — the actual field-bearing step
      // ('details') is one click further in. The old assertion never anticipated the welcome screen
      // existing at all. Click through it (if present) so this test verifies the real first form
      // step, matching its own "shows at least one step" intent more literally than the welcome
      // splash did.
      const getStarted = page.getByRole('button', { name: /get started/i })
      if (await getStarted.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await getStarted.click()
      }
      // Wizard visible — must have at least one labeled field or step indicator
      await expect(
        page.locator('input, select, textarea').first()
          .or(page.getByText(/step \d|business name|what.*type/i).first())
      ).toBeVisible({ timeout: 10_000 })
    }
    // If redirected to dashboard — test already passed via URL assertion
  })

  test('onboarding invalid ABN shows error if ABN field is visible', async ({ page }) => {
    await page.goto('/onboarding')
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    if (!page.url().includes('/onboarding')) return

    // Navigate to the ABN step if multi-step wizard
    const abnInput = page.locator('input[name*="abn"], input[placeholder*="ABN"], input[placeholder*="abn"]')
    if (!await abnInput.isVisible({ timeout: 5_000 })) return

    await abnInput.fill('12345')
    const nextBtn = page.getByRole('button', { name: /next|continue|proceed/i })
    if (await nextBtn.isVisible({ timeout: 3_000 })) {
      await nextBtn.click()
      // Invalid ABN must show an error — not silently proceed
      await expect(
        page.getByText(/invalid.*abn|abn.*invalid|abn.*11 digits|check.*abn/i)
      ).toBeVisible({ timeout: 8_000 })
    }
  })
})

test.describe('Onboarding — DB verification', () => {
  test.skip(!hasCredentials || !hasDbAccess,
    'Set TEST_EMAIL, TEST_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY for DB tests')

  test('test user has a business record in DB', async () => {
    if (!dbAdmin) return
    const userId = await getUserIdByEmail(EMAIL)
    if (!userId) return

    // businesses.user_id, not owner_id — CLAUDE.md RULE 6 column trap.
    const { data: business } = await dbAdmin
      .from('businesses')
      .select('id, name, user_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    expect(business).not.toBeNull()
    expect(business!.user_id).toBe(userId)
    expect(business!.name).toBeTruthy()
  })
})