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

    // CI-E2E-1 follow-up — the old selector ([class*="message"/"response"/"chat"]) never matched
    // anything: the real message bubble wrapper is `className="msg-reveal group"` (src/app/dashboard/
    // ask-aria/page.tsx:1307), which contains none of those substrings. Confirmed by reading the
    // component directly — this was pure selector drift, not Ask Aria failing to respond. .last()
    // still correctly targets the assistant's reply since messages append user-then-assistant in order.
    const response = page.locator('.msg-reveal')
      .filter({ hasText: /\S{10,}/ })
      .last()
    await expect(response).toBeVisible({ timeout: 45_000 })

    const text = await response.textContent()
    expect(text?.trim().length).toBeGreaterThan(20)
    // Must not be an error
    expect(text).not.toMatch(/application error|500|crashed/i)
  })

  // CI-E2E-1 follow-up (re-run finding, UNRESOLVED — flagged, not fixed) — this hit the whole
  // TEST's 60s timeout (playwright.config.ts), not the 60s response-visibility assertion below —
  // meaning the real response genuinely took longer than 60s end-to-end for this "strategic"
  // prompt, on a business with almost no history. The simpler prompt in the test above ("business
  // question…") passed and got a real reply well inside its own 45s budget, ruling out the
  // .msg-reveal selector fix as the cause — this is a genuine latency finding, not a test bug.
  // Deliberately NOT silenced by raising the timeout: every real customer starts as a fresh,
  // sparse-data business, so if analytical/strategic Ask Aria queries are meaningfully slower for
  // exactly that case, that's launch-relevant and worth its own investigation, not hidden here.
  test('strategic question gets a substantive reply', async ({ page }) => {
    await page.goto('/dashboard/ask-aria')
    const input = page.locator('textarea, input[type="text"]').first()
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('Give me one actionable tip to increase revenue this week.')
    await page.keyboard.press('Enter')

    // Reply must be substantive — at least 50 chars. See the other test's comment for why this
    // selector targets .msg-reveal (the real message-bubble class) instead of the old, never-
    // matching [class*="message"/"response"/"chat"].
    const response = page.locator('.msg-reveal')
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
    // CI-E2E-1 follow-up (re-run finding) — 'networkidle' never resolved here even with working
    // auth (this app has continuous background network activity — analytics, polling — that's a
    // known Playwright anti-pattern to wait on; see https://playwright.dev/docs/actionability
    // and onboarding.spec.ts's own .catch(() => {}) on the identical wait). Catching it and relying
    // on the actual content assertion below is the real check, same as every other spec here.
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await expect(page.locator('body')).toBeVisible()
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
    // CI-E2E-1 follow-up — see the other 'networkidle' fix's comment above for why this is guarded
    // rather than awaited directly.
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
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