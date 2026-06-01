import type { Page } from '@playwright/test'

export const EMAIL = process.env.TEST_EMAIL ?? ''
export const PASSWORD = process.env.TEST_PASSWORD ?? ''

/** True when test credentials are configured — use with test.skip */
export const hasCredentials = !!(EMAIL && PASSWORD)

/** Login and wait for dashboard URL */
export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/dashboard|onboarding/, { timeout: 25_000 })
}