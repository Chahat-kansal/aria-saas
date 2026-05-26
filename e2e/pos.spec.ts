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

/**
 * Navigate to the POS terminal and bypass the POSShell staff login screen.
 * POSShell shows "Who's working today?" and requires clicking "Continue as owner"
 * before the actual terminal (with .pos-product-grid) is rendered.
 * Returns false if POS is not enabled for this account (redirected away).
 */
async function openPOSTerminal(page: import('@playwright/test').Page): Promise<boolean> {
  await page.goto('/pos/terminal')
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  if (!page.url().includes('/pos/terminal')) return false

  // POSShell renders staff login first — bypass as owner if present
  const bypassBtn = page.getByRole('button', { name: /continue as owner/i })
  if (await bypassBtn.isVisible({ timeout: 8_000 })) {
    await bypassBtn.click()
    // Wait for terminal UI to render after bypass
    await page.waitForTimeout(1000)
  }
  return true
}

test.describe('POS terminal', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('navigating to POS terminal does not crash', async ({ page }) => {
    await page.goto('/pos/terminal')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/application error|something went wrong/i)).not.toBeVisible()
  })

  test('product grid panel visible after owner bypass', async ({ page }) => {
    if (!await openPOSTerminal(page)) return
    await expect(page.locator('.pos-product-grid')).toBeVisible({ timeout: 10_000 })
  })

  test('can add a product to cart if products exist', async ({ page }) => {
    if (!await openPOSTerminal(page)) return
    const grid = page.locator('.pos-product-grid')
    await expect(grid).toBeVisible({ timeout: 10_000 })
    const productTile = grid.locator('button, [role="button"]').first()
    if (await productTile.isVisible({ timeout: 3_000 })) {
      await productTile.click()
      await expect(page.getByText(/A\$|total/i)).toBeVisible({ timeout: 5_000 })
    }
  })

  test('charge button visible after adding product', async ({ page }) => {
    if (!await openPOSTerminal(page)) return
    const grid = page.locator('.pos-product-grid')
    await expect(grid).toBeVisible({ timeout: 10_000 })
    const productTile = grid.locator('button, [role="button"]').first()
    if (await productTile.isVisible({ timeout: 3_000 })) {
      await productTile.click()
      await expect(page.locator('.charge-btn')).toBeVisible({ timeout: 10_000 })
    }
  })

  test('search bar present in terminal', async ({ page }) => {
    if (!await openPOSTerminal(page)) return
    // POS search has placeholder "Search or scan barcode…"
    await expect(
      page.locator('input[placeholder*="Search"]').or(page.locator('input[placeholder*="scan"]'))
    ).toBeVisible({ timeout: 10_000 })
  })
})
