import type { Page } from '@playwright/test'
import { restoreCachedSession } from './session'

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
  // CI-E2E-1 follow-up — reuse global-setup's cached session (see session.ts) instead of
  // submitting the login form again; a real login only happens if that cache is missing/stale.
  if (await restoreCachedSession(page)) return

  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  // CI-FIX-1 — /login (AuthScene.tsx) has TWO elements matching "Sign in": the tab toggle
  // button and the form's actual submit button, both named identically. Scoped to the form to
  // avoid Playwright's strict-mode violation (was resolving to 2 elements, failing every e2e
  // spec that calls login()).
  await page.locator('form').getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/dashboard|onboarding/, { timeout: 25_000 })
}