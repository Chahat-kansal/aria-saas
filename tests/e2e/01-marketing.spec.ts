import { test, expect } from '@playwright/test'

test.describe('Marketing site', () => {
  // CI-E2E-1 — the landing page shows a one-time full-screen video intro
  // (src/components/marketing/landing/LandingShell.tsx) gated on
  // sessionStorage['aria_intro_seen']. A fresh Playwright context never has
  // this set, so the intro overlay covers the CTA/nav for several seconds
  // (up to a 10-12s fallback) — same experience a first-time visitor gets,
  // but it starves these assertions. Skipping it here tests the actual page
  // content (this suite's intent), not the one-time animation.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('aria_intro_seen', '1'))
  })

  test('homepage loads with title and CTA', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/aria/i)
    await expect(
      page.getByRole('link', { name: /start.*trial|free trial/i }).first()
    ).toBeVisible()
  })

  test('has Log in link in nav', async ({ page }) => {
    await page.goto('/')
    // Sticky overlay renders client-side — wait for it
    await page.waitForLoadState('networkidle')
    const loginLink = page.getByRole('link', { name: /log in/i }).first()
    await expect(loginLink).toBeVisible({ timeout: 10_000 })
  })

  test('login page loads with Sign in button', async ({ page }) => {
    await page.goto('/login')
    // CI-E2E-1 — the loose name regex now also matches the "Sign in"/"Sign up"
    // tab toggle AND "Continue with Google", a Playwright strict-mode
    // violation (3 matches). Scope to the actual form submit button.
    await expect(page.locator('form').getByRole('button', { name: /sign in|log in|continue/i }).first()).toBeVisible()
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test('no app errors on homepage', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const appErrors = errors.filter(
      e => !/posthog|sentry|google|facebook|favicon|analytics|FedCM|vercel-storage|font|CSP|Content Security Policy|GSI_LOGGER|Provider's accounts/i.test(e)
    )
    expect(appErrors).toEqual([])
  })
})
