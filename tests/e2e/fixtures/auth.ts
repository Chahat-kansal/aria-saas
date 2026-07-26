import { test as base, type Page } from '@playwright/test'
import { restoreCachedSession } from '../../../e2e/helpers/session'

type AuthFixtures = {
  authedPage: Page
}

export const test = base.extend<AuthFixtures>({
  // CI-E2E-1 follow-up — reuse e2e/helpers/global-setup.ts's cached session (see
  // e2e/helpers/session.ts's own comment for the full incident: this fixture used to log in fresh
  // on every single test, and combined with e2e/'s own identical pattern, exhausted the login
  // rate limit partway through the first real full-suite run). Falls back to a real login only if
  // the cache is missing/stale.
  authedPage: async ({ page }, use) => {
    const restored = await restoreCachedSession(page)
    if (!restored) {
      const email = process.env.TEST_USER_EMAIL
      const password = process.env.TEST_USER_PASSWORD
      if (!email || !password) {
        throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD env vars required')
      }

      await page.goto('/login')
      // Login form has <label>Email</label> / <label>Password</label> as visual
      // siblings with NO for/id association — getByLabel() can't match them.
      // Use type-based selectors which always work.
      const emailInput = page.locator(
        'input[type="email"], input[name="email"], input[autocomplete="email"], input[autocomplete="username"]'
      ).first()
      await emailInput.waitFor({ state: 'visible', timeout: 15_000 })
      await emailInput.fill(email)

      const passwordInput = page.locator(
        'input[type="password"], input[name="password"], input[autocomplete="current-password"]'
      ).first()
      await passwordInput.fill(password)

      const submitButton = page
        .getByRole('button', { name: /sign in|log in|continue/i })
        .or(page.locator('button[type="submit"]'))
        .first()
      await submitButton.click()
      await page.waitForURL(/\/(pos|dashboard)/, { timeout: 20_000 })
    }

    // POSShell requires a POS staff user in localStorage ('aria_pos_user') to
    // render any page content. Without it, every /pos/* page shows only the
    // POSUserSelect PIN-entry screen and the actual page component is never
    // mounted — causing all content-specific selectors to fail.
    // CI-E2E-1 follow-up (re-run finding) — this used to inject a made-up shape
    // ({role:'manager', permissions:{}}) that doesn't match any real login path. Now byte-for-byte
    // the same object POSShell.tsx's own bypassAsOwner() writes (the real "Continue as owner"
    // button's handler) — see e2e/helpers/global-setup.ts's identical fix for the full story.
    // (global-setup already bakes this in via restoreCachedSession, but re-asserting it here is
    // cheap and idempotent — covers a cache captured before this fix existed.)
    await page.evaluate(() => {
      localStorage.setItem('aria_pos_user', JSON.stringify({
        id: 'owner',
        name: 'Owner',
        role: 'owner',
        permissions: { can_apply_discount: true, can_refund: true, max_discount_pct: 100, can_close_register: true, can_override_price: true },
        loginAt: Date.now(),
      }))
    })

    await use(page)
  },
})

export { expect } from '@playwright/test'
