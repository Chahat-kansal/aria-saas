import { test, expect } from '@playwright/test'
import { login, hasCredentials } from './helpers/auth'

test.describe('Invoices', () => {
  test.skip(!hasCredentials, 'Set TEST_EMAIL and TEST_PASSWORD to run invoice tests')

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('invoice list page loads without errors', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/application error|500/i)).not.toBeVisible()
  })

  test('invoice page shows table or empty state', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/error|500|crashed/i)).not.toBeVisible()
    await expect(
      page.locator('table').or(page.getByText(/no invoices/i))
    ).toBeVisible({ timeout: 10_000 })
  })

  test('create invoice button is accessible', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    await expect(
      page.getByRole('button', { name: '+ New Invoice' })
        .or(page.getByRole('button', { name: /create.*invoice/i }))
    ).toBeVisible({ timeout: 10_000 })
  })

  test('new invoice form opens with input fields', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    const createBtn = page.getByRole('button', { name: '+ New Invoice' })
    await expect(createBtn).toBeVisible({ timeout: 5_000 })
    await createBtn.click()
    // Form must actually have fields — not just open a blank modal
    await expect(
      page.locator('input[type="email"], input[type="text"], textarea').first()
    ).toBeVisible({ timeout: 10_000 })
  })

  // CI-E2E-1 follow-up (re-run finding) — this used to open the BLANK new-invoice creation form and
  // look for a Send button there. Read src/app/dashboard/invoices/page.tsx directly: Send only
  // renders on an ALREADY-SAVED draft invoice's detail view (`selected.status === 'draft'`), a
  // genuinely different screen the old test never reached (it never saved anything first). Selects
  // e2e/helpers/global-setup.ts's seeded draft invoice (invoice_number E2E-TEST-0001) instead.
  test('an existing draft invoice has a send or email action', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    const row = page.getByText('E2E-TEST-0001')
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.click()
    await expect(
      page.getByRole('button', { name: /send|email/i })
        .or(page.getByText(/send invoice|email invoice/i))
    ).toBeVisible({ timeout: 10_000 })
  })
})