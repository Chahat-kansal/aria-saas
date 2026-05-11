import { test, expect } from './fixtures/auth'

test.describe('Reports', () => {
  test('reports index loads', async ({ authedPage: page }) => {
    await page.goto('/pos/reports')
    await expect(
      page.getByRole('heading', { name: /reports/i })
    ).toBeVisible()
  })

  test('cashier report loads without crash', async ({ authedPage: page }) => {
    await page.goto('/pos/reports/cashier')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('text=/Application error|500/i')
    ).toHaveCount(0, { timeout: 10_000 })
  })

  test('commission report loads without crash', async ({ authedPage: page }) => {
    await page.goto('/pos/reports/commission')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('text=/Application error|500/i')
    ).toHaveCount(0, { timeout: 10_000 })
  })

  test('sales report loads without crash', async ({ authedPage: page }) => {
    await page.goto('/pos/reports/sales')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('text=/Application error|500/i')
    ).toHaveCount(0, { timeout: 10_000 })
  })
})
