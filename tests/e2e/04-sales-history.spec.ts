import { test, expect } from './fixtures/auth'

test.describe('Sale history', () => {
  test('history page loads with filters', async ({ authedPage: page }) => {
    await page.goto('/pos/history')
    await expect(
      page.getByRole('heading', { name: /sale history/i })
    ).toBeVisible()
    // Date pickers must be present
    const datePickers = page.locator('input[type="date"]')
    await expect(datePickers.first()).toBeVisible()
    expect(await datePickers.count()).toBeGreaterThanOrEqual(2)
  })

  test('no crash on history page', async ({ authedPage: page }) => {
    await page.goto('/pos/history')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=/Application error|500/i')).toHaveCount(0)
  })

  test('void page loads', async ({ authedPage: page }) => {
    await page.goto('/pos/void')
    await expect(
      page.getByRole('heading', { name: /void/i })
    ).toBeVisible()
    // Search input must be present
    await expect(page.locator('input[placeholder*="receipt" i], input[placeholder*="search" i]')).toBeVisible()
  })
})
