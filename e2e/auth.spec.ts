import { test, expect } from '@playwright/test'
import { login, hasCredentials } from './helpers/auth'

test.describe('Authentication', () => {
  test.skip(!hasCredentials, 'Set TEST_EMAIL and TEST_PASSWORD to run auth tests')

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/dashboard/)
  })

  test('login with invalid credentials shows error message', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('invalid@example.com')
    await page.locator('input[type="password"]').fill('wrong-password-xyz-123!')
    // CI-FIX-1 — see helpers/auth.ts: /login has two "Sign in"-named buttons (tab + submit).
    await page.locator('form').getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText(/invalid|incorrect|wrong|error|credentials/i)).toBeVisible({
      timeout: 10_000,
    })
    await expect(page).not.toHaveURL(/dashboard/)
  })

  test('logout redirects to login page', async ({ page }) => {
    await login(page)
    // Open user menu if needed to find logout
    const logoutBtn = page
      .getByRole('button', { name: /log out|sign out/i })
      .or(page.getByText(/log out|sign out/i))
    // Some layouts hide it behind a menu — try to open a user menu first
    const userMenuTrigger = page
      .getByRole('button', { name: /account|profile|menu/i })
      .or(page.locator('[data-testid="user-menu"]'))
    if (await userMenuTrigger.isVisible({ timeout: 2_000 })) {
      await userMenuTrigger.click()
    }
    await expect(logoutBtn.first()).toBeVisible({ timeout: 8_000 })
    await logoutBtn.first().click()
    await expect(page).toHaveURL(/login|^\/$/, { timeout: 15_000 })
  })

  test('accessing /dashboard without auth redirects to login', async ({ page }) => {
    // Fresh context — no cookies
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/login|auth/, { timeout: 15_000 })
  })

  test('accessing /pos/terminal without auth redirects to login', async ({ page }) => {
    await page.goto('/pos/terminal')
    await expect(page).toHaveURL(/login|auth/, { timeout: 15_000 })
  })

  test('accessing /community without auth shows public feed', async ({ page }) => {
    await page.goto('/community')
    // Public community feed should load (not redirect to login)
    await expect(page).not.toHaveURL(/login/, { timeout: 10_000 })
    // Should show some content — header, feed, or empty state
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/application error|500|crashed/i)).not.toBeVisible()
  })
})