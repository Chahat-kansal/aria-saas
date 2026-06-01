import { test, expect } from '@playwright/test'
import { login, hasCredentials } from './helpers/auth'

test.describe('Community feed — public access', () => {
  test('community feed loads without auth', async ({ page }) => {
    await page.goto('/community')
    await expect(page.locator('body')).toBeVisible()
    await expect(page).not.toHaveURL(/login/, { timeout: 10_000 })
    await expect(page.getByText(/application error|500|crashed/i)).not.toBeVisible()
  })

  test('community page renders at least one content element', async ({ page }) => {
    await page.goto('/community')
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await expect(page.getByText(/application error|something went wrong|crashed/i)).not.toBeVisible()
    // Feed, header, or empty-state message must be visible
    await expect(
      page.locator('article, [class*="post"], [class*="card"], [class*="feed"]')
        .first()
        .or(page.getByText(/no posts|be the first|community/i).first())
    ).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Community feed — authenticated actions', () => {
  test.skip(!hasCredentials, 'Set TEST_EMAIL and TEST_PASSWORD to run authenticated community tests')

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('community feed loads after login without error', async ({ page }) => {
    await page.goto('/community')
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await expect(page.getByText(/application error|500|crashed/i)).not.toBeVisible()
  })

  test('create post button or input is visible when authenticated', async ({ page }) => {
    await page.goto('/community')
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    // Authenticated users should see a way to create a post
    await expect(
      page.getByRole('button', { name: /post|create|share|write/i })
        .or(page.locator('textarea[placeholder*="share"], input[placeholder*="post"], input[placeholder*="write"]'))
        .first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('liking a post increments like count', async ({ page }) => {
    await page.goto('/community')
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})

    // Find first like button with a count
    const likeBtn = page
      .locator('[aria-label*="like"], [data-testid*="like"], button:has([class*="heart"]), button:has([class*="like"])')
      .first()

    if (!await likeBtn.isVisible({ timeout: 5_000 })) return

    // Record current count text
    const countEl = likeBtn.locator('span, [class*="count"]').first()
    const beforeText = await countEl.textContent().catch(() => '0')
    const before = parseInt(beforeText?.replace(/\D/g, '') ?? '0', 10) || 0

    await likeBtn.click()
    await page.waitForTimeout(1_000)

    const afterText = await countEl.textContent().catch(() => '0')
    const after = parseInt(afterText?.replace(/\D/g, '') ?? '0', 10) || 0

    // Count should have changed by ±1 (like or unlike)
    expect(Math.abs(after - before)).toBe(1)
  })

  test('creating a text post adds it to the feed', async ({ page }) => {
    await page.goto('/community')
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})

    // Open create post dialog / input
    const createTrigger = page.getByRole('button', { name: /post|create|share/i }).first()
    if (!await createTrigger.isVisible({ timeout: 5_000 })) return

    await createTrigger.click()

    const postInput = page
      .locator('textarea[placeholder*="share"], textarea[placeholder*="mind"], textarea[placeholder*="write"], textarea')
      .first()
    if (!await postInput.isVisible({ timeout: 5_000 })) return

    const uniqueText = 'Test post from Playwright e2e — ' + Date.now()
    await postInput.fill(uniqueText)

    const submitBtn = page.getByRole('button', { name: /post|publish|share|submit/i })
    if (!await submitBtn.isVisible({ timeout: 3_000 })) return
    await submitBtn.click()

    // The new post must appear in the feed
    await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 15_000 })
  })
})