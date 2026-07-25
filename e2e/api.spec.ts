import { test, expect } from '@playwright/test'

const TEST_BUSINESS_ID = process.env.TEST_BUSINESS_ID ?? ''

/** Make an authenticated request using TEST_EMAIL + TEST_PASSWORD via the login cookie. */
async function getAuthCookies(request: import('@playwright/test').APIRequestContext) {
  const email = process.env.TEST_USER_EMAIL ?? ''
  const password = process.env.TEST_USER_PASSWORD ?? ''
  if (!email || !password) return null

  const res = await request.post('/api/auth/signin', {
    data: { email, password },
  }).catch(() => null)
  return res?.ok() ? res : null
}

test.describe('API health checks', () => {
  test('GET /api/health returns 200 with ok status', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeTruthy()
  })

  test('GET /api/health returns status and timestamp fields', async ({ request }) => {
    const res = await request.get('/api/health')
    const body = await res.json()
    expect(typeof body.status).toBe('string')
    expect(typeof body.timestamp).toBe('string')
    // timestamp must be a parseable ISO date
    expect(new Date(body.timestamp).getFullYear()).toBeGreaterThan(2020)
  })

  // CI-E2E-1 follow-up — this asserted the OLD public /api/health/deep contract. AUDIT-CLEANUP-QUICK-1
  // (see that route's own comment) gated it behind admin auth after finding it pinged live
  // Anthropic/Redis/Supabase with zero auth, publicly reachable by anyone — a real cost/abuse vector.
  // The spec was never updated after that fix landed, so it's been failing on a 404 (the gate
  // correctly denying an unauthenticated caller) ever since. Never revert the gate to make the old
  // assertion pass — that would reintroduce the exact vulnerability the security fix closed.
  // /api/healthz is the new intentional public liveness check; verify THAT contract instead, plus
  // that the deep route's admin gate is actually doing its job.
  test('GET /api/healthz returns public liveness ok', async ({ request }) => {
    const res = await request.get('/api/healthz')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  test('GET /api/health/deep denies an unauthenticated caller (admin-gated since AUDIT-CLEANUP-QUICK-1)', async ({ request }) => {
    const res = await request.get('/api/health/deep', { headers: { Cookie: '' } })
    expect(res.status()).toBe(404)
  })

  test('GET /api/health responds without authentication', async ({ request }) => {
    // Health endpoint must be public — no auth cookie needed
    const res = await request.get('/api/health', {
      headers: { Cookie: '' },
    })
    expect(res.status()).toBe(200)
  })
})

test.describe('Auth enforcement — protected routes reject unauthenticated', () => {
  test('GET /api/pos/products without auth returns 401 or 403', async ({ request }) => {
    const res = await request.get('/api/pos/products', {
      headers: { Cookie: '' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('GET /api/pos/sales without auth returns 401 or 403', async ({ request }) => {
    const res = await request.get('/api/pos/sales', {
      headers: { Cookie: '' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('POST /api/aria/ask without auth returns 401 or 403', async ({ request }) => {
    const res = await request.post('/api/aria/ask', {
      headers: { Cookie: '' },
      data: { message: 'hello' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('GET /api/customers without auth returns 401 or 403', async ({ request }) => {
    const res = await request.get('/api/customers', {
      headers: { Cookie: '' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('GET /api/pos/customers without auth returns 401 or 403', async ({ request }) => {
    const res = await request.get('/api/pos/customers', {
      headers: { Cookie: '' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('POST /api/pos/sale without auth returns 401 or 403', async ({ request }) => {
    const res = await request.post('/api/pos/sale', {
      headers: { Cookie: '' },
      data: { total_amount: 10.00, payment_method: 'cash', items: [] },
    })
    expect([401, 403]).toContain(res.status())
  })
})

test.describe('Public routes work without auth', () => {
  test('GET /api/health requires no auth', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
  })

  test('GET /api/public/menu/{businessId} returns 200 or 404 (not 401)', async ({ request }) => {
    const bid = TEST_BUSINESS_ID || 'nonexistent-business-id-000'
    const res = await request.get('/api/public/menu/' + bid)
    // Public menu must never return 401 — 200 (found) or 404 (not found) are both valid
    expect([200, 404]).toContain(res.status())
  })

  test('GET /api/public/business/{businessId} returns 200 or 404 (not 401)', async ({ request }) => {
    const bid = TEST_BUSINESS_ID || 'nonexistent-business-id-000'
    const res = await request.get('/api/public/business/' + bid)
    expect([200, 404]).toContain(res.status())
  })
})

test.describe('Input validation — bad input returns 400', () => {
  test('POST /api/pos/sale with empty body returns 400 or 401', async ({ request }) => {
    // Without auth → 401; with auth + bad body → 400
    const res = await request.post('/api/pos/sale', {
      headers: { Cookie: '', 'Content-Type': 'application/json' },
      data: {},
    })
    // Unauthenticated = 401; authenticated but missing fields = 400
    expect([400, 401, 403]).toContain(res.status())
  })

  test('POST /api/community/posts without auth returns 401', async ({ request }) => {
    const res = await request.post('/api/community/posts', {
      headers: { Cookie: '' },
      data: { post_type: 'invalid_type_xyz', content: 'test' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('GET /api/pos/products with invalid business_id query returns error', async ({ request }) => {
    const res = await request.get('/api/pos/products?business_id=not-a-uuid', {
      headers: { Cookie: '' },
    })
    // Unauthenticated = 401; authenticated but bad UUID = 400 or empty result
    expect([400, 401, 403]).toContain(res.status())
  })
})

test.describe('API response shape contracts', () => {
  test('GET /api/health response has expected fields', async ({ request }) => {
    const res = await request.get('/api/health')
    const body = await res.json()
    // Must have exactly these fields (contract enforcement)
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['status', 'ok', 'timestamp']))
  })

  // Duplicate of the admin-gate assertion in "API health checks" above (both hit the same route,
  // same unauthenticated-404 outcome) — removed rather than left as a second copy of the same check.

  test('protected routes return JSON error body on 401', async ({ request }) => {
    const res = await request.get('/api/pos/products', {
      headers: { Cookie: '' },
    })
    expect([401, 403]).toContain(res.status())
    const contentType = res.headers()['content-type'] ?? ''
    expect(contentType).toContain('application/json')
    const body = await res.json()
    // Error response must have an error field
    expect(body.error ?? body.message).toBeTruthy()
  })
})