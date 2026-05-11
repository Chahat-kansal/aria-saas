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
    // Login form uses <label>Email</label> and <label>Password</label>
    // with a submit button text "Sign in"
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/password/i).fill(password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/(pos|dashboard)/, { timeout: 20_000 })

    await use(page)
  },
})

export { expect } from '@playwright/test'
