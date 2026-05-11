import { test as base, type Page } from '@playwright/test'

type AuthFixtures = {
  authedPage: Page
}

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
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

    // POSShell requires a POS staff user in localStorage ('aria_pos_user') to
    // render any page content. Without it, every /pos/* page shows only the
    // POSUserSelect PIN-entry screen and the actual page component is never
    // mounted — causing all content-specific selectors to fail.
    // Inject a valid manager user so POSShell renders page content normally.
    await page.evaluate(() => {
      localStorage.setItem('aria_pos_user', JSON.stringify({
        id: 'e2e-test-bypass',
        name: 'E2E Test',
        role: 'manager',
        permissions: {},
        loginAt: Date.now(),
      }))
    })

    await use(page)
  },
})

export { expect } from '@playwright/test'
