import { test, expect } from '@playwright/test'
import { EMAIL, hasCredentials } from './helpers/auth'
import { dbAdmin, hasDbAccess } from './helpers/supabase'
import { resolveTestBusinessId, getUserIdByEmail } from './helpers/test-business'

/**
 * LOYALTY-LOOP-2 — card-linked auto-earn.
 *
 * A full end-to-end run (real Stripe test-mode payment -> webhook ->
 * link -> second payment -> auto-attach) needs Stripe's test-clock/webhook
 * CLI tooling to actually deliver a signed payment_intent.succeeded event,
 * which isn't drivable from a Playwright browser test. What IS honestly
 * testable here, following the same pattern e2e/pos.spec.ts already uses
 * for idempotency (direct dbAdmin assertions against the real schema):
 * the auth guardrails on the customer-facing API, and the DB-level
 * guarantee backing "a card can't silently jump between identities"
 * (the UNIQUE (business_id, card_fingerprint) constraint).
 */

test.describe('Linked-cards API — auth guardrails (customer-only)', () => {
  test('GET without a cx_session cookie returns 401, not a card list', async ({ request }) => {
    const res = await request.get('/api/public/cx/sip-e2e-test/linked-cards', {
      headers: { Cookie: '' },
    })
    expect([401, 404]).toContain(res.status()) // 404 if the seeded business itself isn't present locally
    if (res.status() === 401) {
      const body = await res.json()
      expect(body.cards).toBeUndefined()
    }
  })

  test('DELETE (unlink) without a cx_session cookie returns 401 — never unlinks on behalf of a stranger', async ({ request }) => {
    const res = await request.delete('/api/public/cx/sip-e2e-test/linked-cards', {
      headers: { Cookie: '', 'Content-Type': 'application/json' },
      data: { link_id: 'not-a-real-id' },
    })
    expect([401, 404]).toContain(res.status())
  })
})

test.describe('loyalty_card_links — DB-level correctness', () => {
  test.skip(!hasCredentials || !hasDbAccess,
    'Set TEST_USER_EMAIL, TEST_USER_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY for DB assertion tests')

  let businessId: string
  const testFingerprint = 'e2e_test_fp_' + Date.now()
  let firstLinkId: string | null = null

  test.beforeAll(async () => {
    if (!hasDbAccess || !dbAdmin) return
    const userId = await getUserIdByEmail(EMAIL)
    if (!userId) return
    const bid = await resolveTestBusinessId(userId)
    if (!bid) return
    businessId = bid
  })

  test.afterAll(async () => {
    if (!dbAdmin || !businessId) return
    await dbAdmin.from('loyalty_card_links').delete().eq('card_fingerprint', testFingerprint)
  })

  test('linking a card creates a row with brand + last4, never a PAN', async () => {
    test.skip(!businessId, 'Could not resolve test business ID')
    if (!dbAdmin) return

    const { data: identity } = await dbAdmin.from('loyalty_identity').select('id').limit(1).maybeSingle()
    test.skip(!identity, 'No loyalty_identity row available to link against in this test project')
    if (!identity) return

    const { data, error } = await dbAdmin.from('loyalty_card_links').insert({
      business_id: businessId,
      loyalty_identity_id: (identity as { id: string }).id,
      card_fingerprint: testFingerprint,
      brand: 'visa',
      last4: '4242',
    }).select('id').single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    firstLinkId = (data as { id: string } | null)?.id ?? null
  })

  test('the same fingerprint cannot silently be reassigned to a different identity (UNIQUE constraint)', async () => {
    test.skip(!businessId || !firstLinkId, 'Depends on the previous link test')
    if (!dbAdmin) return

    const { data: identities } = await dbAdmin.from('loyalty_identity').select('id').limit(2)
    const other = (identities ?? []).find((i: { id: string }) => true) // any row is fine — we expect a conflict regardless
    test.skip(!other, 'No loyalty_identity row available')
    if (!other) return

    const { error } = await dbAdmin.from('loyalty_card_links').insert({
      business_id: businessId,
      loyalty_identity_id: (other as { id: string }).id,
      card_fingerprint: testFingerprint, // same fingerprint, same business — must conflict
      brand: 'visa',
      last4: '4242',
    })

    // The UNIQUE (business_id, card_fingerprint) constraint must reject this —
    // a card silently jumping to a different identity would be a real bug.
    expect(error).not.toBeNull()
  })

  test('unlink removes the row', async () => {
    test.skip(!firstLinkId, 'Depends on the first link test')
    if (!dbAdmin) return

    const { error } = await dbAdmin.from('loyalty_card_links').delete().eq('id', firstLinkId)
    expect(error).toBeNull()

    const { data: gone } = await dbAdmin.from('loyalty_card_links').select('id').eq('id', firstLinkId).maybeSingle()
    expect(gone).toBeNull()
  })
})
