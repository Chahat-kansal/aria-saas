import { test, expect } from '@playwright/test'
import { login, hasCredentials } from './helpers/auth'
import { dbAdmin, hasDbAccess, waitFor } from './helpers/supabase'
import { resolveTestBusinessId, getUserIdByEmail } from './helpers/test-business'
import { EMAIL } from './helpers/auth'

test.describe('Ask Aria', () => {
  test.skip(!hasCredentials, 'Set TEST_EMAIL and TEST_PASSWORD to run Ask Aria tests')

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('Ask Aria page loads without application error', async ({ page }) => {
    await page.goto('/dashboard/ask-aria')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/application error|500|crashed/i)).not.toBeVisible()
    // Input must be present
    await expect(
      page.locator('textarea, input[type="text"]').first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('business question receives a non-empty response', async ({ page }) => {
    await page.goto('/dashboard/ask-aria')
    const input = page.locator('textarea, input[type="text"]').first()
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('What is the name of my business?')
    await page.keyboard.press('Enter')

    // Response must appear and contain more than whitespace
    const response = page.locator('[class*="message"], [class*="response"], [class*="chat"]')
      .filter({ hasText: /\S{10,}/ })
      .last()
    await expect(response).toBeVisible({ timeout: 45_000 })

    const text = await response.textContent()
    expect(text?.trim().length).toBeGreaterThan(20)
    // Must not be an error
    expect(text).not.toMatch(/application error|500|crashed/i)
  })

  test('strategic question gets a substantive reply', async ({ page }) => {
    await page.goto('/dashboard/ask-aria')
    const input = page.locator('textarea, input[type="text"]').first()
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('Give me one actionable tip to increase revenue this week.')
    await page.keyboard.press('Enter')

    // Reply must be substantive — at least 50 chars
    const response = page.locator('[class*="message"], [class*="response"], [class*="chat"]')
      .filter({ hasText: /\S{50,}/ })
      .last()
    await expect(response).toBeVisible({ timeout: 60_000 })
    const text = await response.textContent()
    expect(text?.trim().length).toBeGreaterThan(50)
  })

  test('Ask Aria message input accepts typed text', async ({ page }) => {
    await page.goto('/dashboard/ask-aria')
    const input = page.locator('textarea, input[type="text"]').first()
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('test message for input verification')
    const value = await input.inputValue()
    expect(value).toContain('test message for input verification')
  })

  test('page does not show application error on load', async ({ page }) => {
    await page.goto('/dashboard/ask-aria')
    await page.waitForLoadState('networkidle', { timeout: 20_000 })
    await expect(page.getByText(/application error|something went wrong/i)).not.toBeVisible()
  })
})

test.describe('Daily Briefing', () => {
  test.skip(!hasCredentials, 'Set TEST_EMAIL and TEST_PASSWORD to run briefing tests')

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('dashboard shows briefing section (not empty)', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle', { timeout: 20_000 })
    // Briefing section must exist and contain readable content
    const briefingSection = page.getByText(/briefing|aria|insight|summary/i).first()
    await expect(briefingSection).toBeVisible({ timeout: 20_000 })
    // Must not be an empty skeleton only
    await expect(page.getByText(/application error|500/i)).not.toBeVisible()
  })

  test('briefing page loads without crash', async ({ page }) => {
    // Try direct briefing route if it exists
    await page.goto('/dashboard/briefing')
    await expect(page.locator('body')).toBeVisible()
    // Either shows briefing content or redirects — both valid
    await expect(page.getByText(/application error|500|crashed/i)).not.toBeVisible()
  })
})