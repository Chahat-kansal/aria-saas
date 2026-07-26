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
    // CI-E2E-1 follow-up (re-run finding) — the old "try to open a user menu first" fallback
    // assumed a hidden dropdown that this app doesn't have: src/components/dashboard/Sidebar.tsx
    // puts sign-out directly in the sidebar as a standalone icon button, always visible, no menu to
    // open. Worse, its own broad match (/account|profile|menu/i) also matched the ADJACENT real
    // navigation link (title/aria-label "Account & profile", href="/profile") — clicking it
    // navigated away to /profile before the test ever found the actual sign-out button. The button
    // itself is icon-only and now has an explicit aria-label (Sidebar.tsx) rather than relying on
    // `title` alone, which getByRole's accessible-name computation didn't reliably pick up.
    const logoutBtn = page.getByRole('button', { name: /log out|sign out/i })
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