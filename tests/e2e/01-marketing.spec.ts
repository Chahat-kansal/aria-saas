import { test, expect } from '@playwright/test'

test.describe('Marketing site', () => {
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
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
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
      e => !/posthog|sentry|google|facebook|favicon|analytics/i.test(e)
    )
    expect(appErrors).toEqual([])
  })
})
