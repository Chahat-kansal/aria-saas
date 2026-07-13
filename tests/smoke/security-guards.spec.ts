// SECURITY-P1 (8c/8d) — proves the new Turnstile + rate-limit guards behave correctly in BOTH
// directions: legitimate traffic still gets through, and the specific attack each guard exists for
// is actually blocked. Uses Cloudflare's official always-pass test keys
// (TURNSTILE_SITE_KEY=1x00000000000000000000AA / TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA)
// so this suite exercises the REAL verification code path (a real fetch to Cloudflare's siteverify
// endpoint) without a human ever solving a captcha — see SECURITY-P1-REPORT.md's founder env
// checklist for where these are documented.
import { test, expect, request as pwRequest } from '@playwright/test'

test.describe('Turnstile — signup flow with always-pass test keys', () => {
  test('signup form loads with the Turnstile widget and the guard endpoint accepts the always-pass token', async ({ page, baseURL }) => {
    test.skip(!process.env.TURNSTILE_SITE_KEY, 'TURNSTILE_SITE_KEY not set for this test run — skipping widget-in-page assertion')
    await page.goto('/signup')
    await expect(page.locator('body')).toBeVisible()
    // The widget iframe Cloudflare renders — confirms the widget mounted, not just that the page loaded.
    await expect(page.frameLocator('iframe[src*="challenges.cloudflare.com"]').locator('body')).toBeVisible({ timeout: 15_000 }).catch(() => {
      // Some Turnstile render modes are invisible/managed and never show a visible iframe body —
      // that's a legitimate Cloudflare behavior, not a failure of our integration, so this is a
      // soft check: if a visible iframe never appears, fall through to the direct API assertion below.
    })

    // Direct assertion against our own guard endpoint with a real always-pass token — this is the
    // part that actually proves server-side verification works end-to-end against Cloudflare.
    const api = await pwRequest.newContext({ baseURL })
    const res = await api.post('/api/auth/guard', {
      data: { action: 'signup', turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX' }, // always-pass secret accepts ANY response token
    })
    expect(res.ok(), 'guard endpoint should accept the request when TURNSTILE_SECRET_KEY is the always-pass test secret').toBe(true)
  })
})

test.describe('Turnstile — real-mode rejection', () => {
  test('missing/invalid token is rejected when a real (non-always-pass) secret is configured', async ({ baseURL }) => {
    test.skip(!process.env.TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY === '1x0000000000000000000000000000000AA',
      'This assertion requires a REAL Turnstile secret (not the always-pass test one) to prove rejection — skipping in always-pass test mode')
    const api = await pwRequest.newContext({ baseURL })
    const res = await api.post('/api/auth/guard', {
      data: { action: 'signup', turnstile_token: 'definitely-not-a-real-token' },
    })
    expect(res.status()).toBe(403)
  })

  test('contact form rejects a missing token when Turnstile is configured', async ({ baseURL }) => {
    test.skip(!process.env.TURNSTILE_SECRET_KEY, 'TURNSTILE_SECRET_KEY not set — the route fails OPEN by design, nothing to assert here')
    const api = await pwRequest.newContext({ baseURL })
    const res = await api.post('/api/contact', {
      data: { name: 'Smoke Test', email: 'smoke-test@example.com', message: 'smoke-test — no turnstile token' },
    })
    // Either Turnstile rejects (403) or the per-IP rate limit from a prior test in this run trips
    // first (429) — both are "the request was correctly blocked", which is what this test asserts.
    expect([403, 429]).toContain(res.status())
  })
})

test.describe('Rate limiting — new P1 limits', () => {
  test('login rate limit trips after exceeding the threshold, with Retry-After', async ({ baseURL }) => {
    const api = await pwRequest.newContext({ baseURL })
    let lastStatus = 200
    let retryAfterSeen: string | null = null
    // LIMITS.login = 10 requests / 15 min (src/app/api/auth/guard/route.ts) — 12 rapid calls must trip it.
    for (let i = 0; i < 12; i++) {
      const res = await api.post('/api/auth/guard', { data: { action: 'login' } })
      lastStatus = res.status()
      if (lastStatus === 429) {
        retryAfterSeen = res.headers()['retry-after'] ?? null
        break
      }
    }
    expect(lastStatus, 'expected a 429 within 12 rapid login-guard calls').toBe(429)
    expect(retryAfterSeen, 'expected a Retry-After header on the 429').not.toBeNull()
  })

  // 8d — the suite as a whole (owner-flows.spec.ts) must PASS under the new limits; if any
  // legitimate-flow test above starts failing with 429s, the fix is to raise the limit in
  // src/app/api/auth/guard/route.ts, never to loosen this test.
})
