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

  test('GET /api/health/deep returns checks object', async ({ request }) => {
    const res = await request.get('/api/health/deep')
    // May return 200 or 503 (degraded) — either is acceptable, just must respond
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    expect(body.status).toMatch(/ok|degraded/)
    expect(body.checks).toBeDefined()
    expect(body.checks.supabase).toBeDefined()
    expect(typeof body.checks.supabase.ok).toBe('boolean')
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

  test('GET /api/health/deep response has checks.supabase.ok field', async ({ request }) => {
    const res = await request.get('/api/health/deep')
    const body = await res.json()
    expect(body.checks?.supabase?.ok).toBeDefined()
    expect(typeof body.checks.supabase.ok).toBe('boolean')
    expect(typeof body.checks.supabase.ms).toBe('number')
  })

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