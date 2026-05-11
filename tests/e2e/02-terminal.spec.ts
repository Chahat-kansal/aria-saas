import { test, expect } from './fixtures/auth'

test.describe('Terminal', () => {
  test('loads with Pulse Rail and main shell', async ({ authedPage: page }) => {
    await page.goto('/pos/terminal')
    await expect(page.locator('.aria-pulse-rail')).toBeVisible({ timeout: 15_000 })
    // Sidebar chrome should NOT leak a low-stock banner
    await expect(page.locator('text=/products running low/i')).toHaveCount(0)
    // Cart panel exists
    await expect(page.locator('.cart-items')).toBeVisible()
  })

  test('no 500 errors or critical console errors on terminal', async ({ authedPage: page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    page.on('response', resp => {
      if (resp.status() >= 500) errors.push(`${resp.status()} ${resp.url()}`)
    })
    await page.goto('/pos/terminal')
    await page.waitForLoadState('networkidle')
    // Wait 3s to catch any delayed polling (e.g. 30s pulse rail)
    await page.waitForTimeout(3_000)
    const critical = errors.filter(
      e => !/posthog|sentry|favicon|google-analytics/i.test(e)
    )
    expect(critical).toEqual([])
  })

  test('cart starts empty', async ({ authedPage: page }) => {
    await page.goto('/pos/terminal')
    await expect(page.locator('.cart-items')).toBeVisible()
    const items = await page.locator('.cart-line').count()
    expect(items).toBe(0)
  })

  test('Ask Aria FAB is visible', async ({ authedPage: page }) => {
    await page.goto('/pos/terminal')
    // FAB is <Link aria-label="Ask Aria" className="ask-aria-fab">
    // Use aria-label role query — more robust than CSS class
    await expect(page.getByRole('link', { name: 'Ask Aria' })).toBeVisible({ timeout: 15_000 })
  })
})
