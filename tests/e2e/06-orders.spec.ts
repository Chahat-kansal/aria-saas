import { test, expect } from './fixtures/auth'

test.describe('Orders (Smart Order Builder)', () => {
  test('orders list loads', async ({ authedPage: page }) => {
    await page.goto('/pos/orders')
    await expect(
      page.getByRole('heading', { name: /orders|purchase orders/i })
    ).toBeVisible()
    await expect(page.locator('text=/Application error|500/i')).toHaveCount(0)
  })

  test('new order page loads with product search', async ({ authedPage: page }) => {
    await page.goto('/pos/orders/new')
    await expect(
      page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="product" i]')
    ).toBeVisible({ timeout: 10_000 })
  })

  test('draft save works when a product is added', async ({ authedPage: page }) => {
    await page.goto('/pos/orders/new')
    // Look for an add button on a product card
    const addBtn = page.locator('button:has-text("Add")').first()
    const hasAdd = (await addBtn.count()) > 0
    test.skip(!hasAdd, 'No products available to add')
    await addBtn.click()
    // Save Draft button should enable
    const saveBtn = page.getByRole('button', { name: /save draft/i })
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
    await saveBtn.click()
    // Should toast success, not error
    await expect(page.locator('text=/saved|success/i')).toBeVisible({ timeout: 8_000 })
  })

  test('market price resolves within 8s (no infinite Loading…)', async ({ authedPage: page }) => {
    await page.goto('/pos/orders/new')
    const addBtn = page.locator('button:has-text("Add")').first()
    const hasAdd = (await addBtn.count()) > 0
    test.skip(!hasAdd, 'No products available')
    await addBtn.click()
    // Wait until "Loading…" text is gone
    await expect(page.locator('text=/Loading…/i')).toHaveCount(0, { timeout: 8_000 })
  })
})
