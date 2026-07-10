import type { Page } from '@playwright/test'

// CI-E2E-1 — standardized on TEST_USER_EMAIL/TEST_USER_PASSWORD (matching
// tests/e2e/fixtures/auth.ts and the existing prod-smoke workflow's secret
// names) — this file previously read TEST_EMAIL/TEST_PASSWORD, a name the
// CI workflow never actually set, so every credentialed test in e2e/ silently
// skipped on every run.
export const EMAIL = process.env.TEST_USER_EMAIL ?? ''
export const PASSWORD = process.env.TEST_USER_PASSWORD ?? ''

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