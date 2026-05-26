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

const SIDEBAR_PATHS = [
  '/dashboard/sales',
  '/dashboard/products',
  '/dashboard/customers',
  '/dashboard/staff',
]

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('dashboard overview loads without errors', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/application error|something went wrong|500/i)).not.toBeVisible()
  })

  test('revenue metrics or data cards are visible', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(
      page.getByText(/today|this week|revenue|\$|sales/i).first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test('sidebar navigation renders', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(
      page.locator('nav, [class*="sidebar"], [class*="nav"]').first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('briefing or AI section is visible', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(
      page.getByText(/briefing|aria|insight|summary/i).first()
    ).toBeVisible({ timeout: 20_000 })
  })

  for (const path of SIDEBAR_PATHS) {
    test(`${path} page loads without 500`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('body')).toBeVisible()
      await expect(page.getByText(/application error|500 internal/i)).not.toBeVisible()
    })
  }
})
