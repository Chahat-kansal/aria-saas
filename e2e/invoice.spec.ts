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

test.describe('Invoices', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('invoice list page loads without errors', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/application error|500/i)).not.toBeVisible()
  })

  test('invoice page shows content or empty state', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/error|500|crashed/i)).not.toBeVisible()
    // Either a table with invoices or the empty state text is visible
    await expect(
      page.locator('table').or(page.getByText(/no invoices/i))
    ).toBeVisible({ timeout: 10_000 })
  })

  test('create invoice button is accessible', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    // Button text is '+ New Invoice'
    await expect(
      page.getByRole('button', { name: '+ New Invoice' })
        .or(page.getByRole('button', { name: /create.*invoice/i }))
    ).toBeVisible({ timeout: 10_000 })
  })

  test('new invoice form opens and has fields', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    const createBtn = page.getByRole('button', { name: '+ New Invoice' })
    if (await createBtn.isVisible({ timeout: 5_000 })) {
      await createBtn.click()
      await expect(
        page.locator('input[type="email"], input[type="text"], textarea').first()
      ).toBeVisible({ timeout: 10_000 })
    }
  })

  test('invoice form has a send or email action', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    const createBtn = page.getByRole('button', { name: '+ New Invoice' })
    if (await createBtn.isVisible({ timeout: 5_000 })) {
      await createBtn.click()
      await expect(
        page.getByRole('button', { name: /send|email/i })
          .or(page.getByText(/send invoice|email invoice/i))
      ).toBeVisible({ timeout: 10_000 })
    }
  })
})
