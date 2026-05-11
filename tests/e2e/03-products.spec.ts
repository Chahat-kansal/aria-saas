import { test, expect } from './fixtures/auth'

test.describe('Products', () => {
  test('product list loads', async ({ authedPage: page }) => {
    await page.goto('/pos/products')
    await expect(
      page.getByRole('heading', { name: /products/i })
    ).toBeVisible()
    // No crash
    await expect(page.locator('text=/Application error|500/i')).toHaveCount(0)
  })

  test('can open a product edit page', async ({ authedPage: page }) => {
    await page.goto('/pos/products')
    const firstProduct = page.locator('a[href*="/pos/products/"]').first()
    const exists = (await firstProduct.count()) > 0
    test.skip(!exists, 'No products in test database')
    await firstProduct.click()
    await expect(page).toHaveURL(/\/pos\/products\/[^/]+/)
    await expect(page.locator('text=/500|Internal Server Error/i')).toHaveCount(0)
  })

  test('product edit tabs render without crash', async ({ authedPage: page }) => {
    await page.goto('/pos/products')
    const firstProduct = page.locator('a[href*="/pos/products/"]').first()
    const exists = (await firstProduct.count()) > 0
    test.skip(!exists, 'No products in test database')
    await firstProduct.click()
    // Click into edit
    const editBtn = page.getByRole('link', { name: /edit/i }).first()
    if ((await editBtn.count()) > 0) {
      await editBtn.click()
      await expect(page).toHaveURL(/\/edit/)
      // Loyalty tab should not throw 500
      await page.getByRole('button', { name: /loyalty/i }).click()
      await expect(page.locator('text=/500|Application error/i')).toHaveCount(0)
    }
  })
})
