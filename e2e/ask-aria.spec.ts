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

test.describe('Ask Aria', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('Ask Aria page loads without errors', async ({ page }) => {
    await page.goto('/dashboard/ask-aria')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/error|500|crashed/i)).not.toBeVisible()
  })

  test('message input is present', async ({ page }) => {
    await page.goto('/dashboard/ask-aria')
    await expect(
      page.locator('textarea, input[type="text"]').first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('can type and send a question', async ({ page }) => {
    await page.goto('/dashboard/ask-aria')
    const input = page.locator('textarea, input[type="text"]').first()
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('How is my business doing today?')
    await page.keyboard.press('Enter')
    // Aria should respond within 30 seconds
    await expect(
      page.locator('[class*="block"], [class*="response"], p').filter({ hasText: /\S+/ }).first()
    ).toBeVisible({ timeout: 30_000 })
  })

  test('page does not show application error', async ({ page }) => {
    await page.goto('/dashboard/ask-aria')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })
    await expect(page.getByText(/application error|something went wrong/i)).not.toBeVisible()
  })
})
