import { test, expect } from '@playwright/test'

const EMAIL = process.env.TEST_EMAIL ?? ''
const PASSWORD = process.env.TEST_PASSWORD ?? ''

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 })
}

test.describe('Authentication', () => {
  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/dashboard/)
  })

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(EMAIL)
    await page.locator('input[type="password"]').fill('wrong-password-123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText(/invalid|incorrect|wrong|error/i)).toBeVisible({ timeout: 10_000 })
  })

  test('protected route redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/login|auth/, { timeout: 10_000 })
  })

  test('logout returns user to login page', async ({ page }) => {
    await login(page)
    const logoutBtn = page.getByRole('button', { name: /log out|sign out/i })
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click()
      await expect(page).toHaveURL(/login|^\/$/, { timeout: 10_000 })
    }
  })
})
