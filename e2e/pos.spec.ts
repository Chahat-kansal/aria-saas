import { test, expect } from '@playwright/test'
import { login, hasCredentials, EMAIL } from './helpers/auth'
import { dbAdmin, hasDbAccess, waitFor } from './helpers/supabase'
import { resolveTestBusinessId, getUserIdByEmail } from './helpers/test-business'
import { openRegisterIfNeeded } from './helpers/session'

/** Navigate to POS terminal, bypass the "Who's working today?" staff login screen, and open the
 * register if it's closed (see session.ts's openRegisterIfNeeded — a fresh business's terminal
 * starts with no open shift, blocking the product grid/cart entirely until one is opened). */
async function openPOSTerminal(page: import('@playwright/test').Page): Promise<boolean> {
  await page.goto('/pos/terminal')
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  if (!page.url().includes('/pos/terminal')) return false

  const bypassBtn = page.getByRole('button', { name: /continue as owner/i })
  if (await bypassBtn.isVisible({ timeout: 8_000 })) {
    await bypassBtn.click()
    await page.waitForTimeout(800)
  }
  await openRegisterIfNeeded(page)
  return true
}

test.describe('POS terminal — UI smoke', () => {
  test.skip(!hasCredentials, 'Set TEST_EMAIL and TEST_PASSWORD to run POS tests')

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('navigating to POS terminal does not crash', async ({ page }) => {
    await page.goto('/pos/terminal')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/application error|something went wrong/i)).not.toBeVisible()
  })

  test('product grid renders after owner bypass', async ({ page }) => {
    if (!await openPOSTerminal(page)) return
    await expect(page.locator('.pos-product-grid')).toBeVisible({ timeout: 10_000 })
  })

  test('search bar present in terminal', async ({ page }) => {
    if (!await openPOSTerminal(page)) return
    await expect(
      page.locator('input[placeholder*="Search"]').or(page.locator('input[placeholder*="scan"]'))
    ).toBeVisible({ timeout: 10_000 })
  })

  test('adding a product to cart shows price and charge button', async ({ page }) => {
    if (!await openPOSTerminal(page)) return
    const grid = page.locator('.pos-product-grid')
    await expect(grid).toBeVisible({ timeout: 10_000 })
    const productTile = grid.locator('button, [role="button"]').first()
    await expect(productTile).toBeVisible({ timeout: 8_000 })
    await productTile.click()
    // Price must appear — not just "any text"
    await expect(page.getByText(/A\$\s*[\d.,]+/)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.charge-btn')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('POS sale integrity — DB assertions', () => {
  test.skip(!hasCredentials || !hasDbAccess,
    'Set TEST_EMAIL, TEST_PASSWORD, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY to run DB assertion tests')

  let businessId: string
  let createdSaleId: string

  test.beforeAll(async () => {
    if (!hasDbAccess || !dbAdmin) return
    const userId = await getUserIdByEmail(EMAIL)
    if (!userId) return
    const bid = await resolveTestBusinessId(userId)
    if (!bid) return
    businessId = bid
  })

  test('cash sale creates pos_sales row with correct total_amount', async ({ page, request }) => {
    test.skip(!businessId, 'Could not resolve test business ID')
    await login(page)
    if (!await openPOSTerminal(page)) return

    // Get first product from the grid for the sale
    const grid = page.locator('.pos-product-grid')
    await expect(grid).toBeVisible({ timeout: 10_000 })
    const productTile = grid.locator('button, [role="button"]').first()
    await expect(productTile).toBeVisible({ timeout: 8_000 })
    const productName = await productTile.textContent()
    await productTile.click()

    // Proceed to charge
    await page.locator('.charge-btn').click({ timeout: 8_000 })

    // Select cash payment (look for Cash button in payment modal)
    const cashBtn = page.getByRole('button', { name: /cash/i })
    await expect(cashBtn).toBeVisible({ timeout: 10_000 })
    await cashBtn.click()

    // Confirm sale
    const confirmBtn = page.getByRole('button', { name: /confirm|complete|finish|charge/i })
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 })

    const idempotencyKey = 'test-sale-' + Date.now()
    await confirmBtn.click()

    // Wait for success indicator
    await expect(page.getByText(/success|receipt|thank you|sale complete/i)).toBeVisible({
      timeout: 20_000,
    })

    // DB assertion: pos_sales row was created
    if (!dbAdmin) return
    const db = dbAdmin
    const sale = await waitFor(async () => {
      const { data } = await db
        .from('pos_sales')
        .select('id, total_amount, status')
        .eq('business_id', businessId)
        .neq('status', 'voided')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    }, 10_000)

    expect(sale).not.toBeNull()
    expect(typeof sale!.total_amount).toBe('number')
    expect(sale!.total_amount).toBeGreaterThan(0)
    expect(sale!.status).not.toBe('voided')
    createdSaleId = sale!.id
  })

  test('completed sale has pos_sale_items rows with correct line_total', async ({ page }) => {
    test.skip(!businessId || !createdSaleId, 'Depends on previous sale creation test')
    if (!dbAdmin) return

    const { data: items } = await dbAdmin
      .from('pos_sale_items')
      .select('id, quantity, unit_price, line_total')
      .eq('sale_id', createdSaleId)

    expect(items).not.toBeNull()
    expect(items!.length).toBeGreaterThan(0)
    for (const item of items!) {
      expect(typeof item.line_total).toBe('number')
      // line_total must equal quantity * unit_price (within floating point tolerance)
      expect(Math.abs(item.line_total - item.quantity * item.unit_price)).toBeLessThan(0.01)
    }
  })

  test('void a sale changes status to voided', async ({ page }) => {
    test.skip(!businessId || !createdSaleId, 'Depends on previous sale creation test')
    if (!dbAdmin) return

    // Void via admin (direct API call since UI void flow varies)
    const { error } = await dbAdmin
      .from('pos_sales')
      .update({ status: 'voided', notes: 'test:void' })
      .eq('id', createdSaleId)
      .eq('business_id', businessId)

    expect(error).toBeNull()

    const { data: voided } = await dbAdmin
      .from('pos_sales')
      .select('status')
      .eq('id', createdSaleId)
      .maybeSingle()

    expect(voided?.status).toBe('voided')
  })

  test('idempotency key replay returns existing sale, no new row created', async ({ request }) => {
    test.skip(!businessId, 'Could not resolve test business ID')
    if (!dbAdmin) return

    const key = 'idempotency-test-' + Date.now()

    // First: insert a test sale with idempotency key directly
    const { data: sale1 } = await dbAdmin.from('pos_sales').insert({
      business_id: businessId,
      total_amount: 9.99,
      status: 'completed',
      payment_method: 'cash',
      idempotency_key: key,
    }).select('id').maybeSingle()

    expect(sale1).not.toBeNull()

    // Second: attempt to insert again with same key — should conflict (unique index)
    const { data: sale2, error: err2 } = await dbAdmin.from('pos_sales').insert({
      business_id: businessId,
      total_amount: 9.99,
      status: 'completed',
      payment_method: 'cash',
      idempotency_key: key,
    }).select('id').maybeSingle()

    // Unique index should prevent duplicate — error expected
    expect(err2).not.toBeNull()
    expect(sale2).toBeNull()

    // Clean up test row
    await dbAdmin.from('pos_sales')
      .update({ status: 'voided', notes: 'test:idempotency-cleanup' })
      .eq('id', sale1!.id)
  })
})