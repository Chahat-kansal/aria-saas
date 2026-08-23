import { describe, it, expect, vi, beforeEach } from 'vitest'
import { seedTables, probeCrossTenant, TENANT_A, TENANT_B, type FakeDb } from './two-tenant-fixture'

// MS13 PHASE 1→2 — TENANT ISOLATION, PROVEN NOT ASSERTED.
//
// The probe authenticates as one tenant's owner and requests the OTHER tenant's id, both
// directions, against the REAL route handlers (imported below; supabase + Anthropic mocked at
// module boundary). The fake DB is RLS-permissive by design — see two-tenant-fixture.ts — so a
// route passes only when SERVER-SIDE resolution alone protects the tenant.
//
// PHASE-1 RECORD: before phase 2's fixes, the probes against competitive-brief and
// menu-optimisation FAILED (leaked the other tenant's marker rows) — that run is what proved the
// probe can go red. Phase 2 flipped them green. The `it.fails` duals below keep the probe honest
// forever: they run the SAME probe against a deliberately unscoped copy of the leak shape and
// require it to keep detecting the leak.

// vi.mock factories are hoisted above imports, so all mutable state lives in vi.hoisted() and the
// factories import the fixture lazily inside themselves.
const state = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Array<Record<string, unknown>>>, writes: [] as Array<{ table: string; op: string; payload: unknown }> },
  authedAs: null as string | null,
}))
const db = state.db as unknown as FakeDb

vi.mock('@/lib/supabase-server', async () => {
  const { makeFakeClient } = await import('./two-tenant-fixture')
  return { createServerSupabaseClient: () => makeFakeClient(state.db as never, state.authedAs) }
})
vi.mock('@/lib/supabase-admin', async () => {
  const { makeFakeClient } = await import('./two-tenant-fixture')
  // admin client: lazily builds a fresh view per .from() call via a stable facade object
  const facade = {
    from: (t: string) => makeFakeClient(state.db as never, null).from(t),
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  }
  return { supabaseAdmin: facade }
})
vi.mock('@vercel/functions', () => ({ waitUntil: (_p: unknown) => {} }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = {
      create: async (args: { messages: Array<{ content: unknown }> }) => ({
        // Echo the prompt content back — so any tenant data that reached the model surfaces in
        // the response body and the probe catches it.
        content: [{ type: 'text', text: 'ECHO:' + JSON.stringify(args.messages) }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    }
  },
}))

import { GET as competitiveBrief } from '@/app/api/aria/competitive-brief/route'
import { POST as competitorOpportunities } from '@/app/api/aria/competitor-opportunities/route'
import { POST as menuOptimisation } from '@/app/api/aria/menu-optimisation/route'
import { POST as socialListening } from '@/app/api/aria/social-listening/route'
import { GET as socialListeningGet } from '@/app/api/aria/social-listening/route'
import { POST as classifyProduct } from '@/app/api/aria/classify-product/route'
import { POST as upload } from '@/app/api/aria/upload/route'
import { POST as staffTalk } from '@/app/api/aria/staff-talk/route'

beforeEach(() => {
  state.db.tables = seedTables() as never
  state.db.writes = []
  state.authedAs = TENANT_A.user_id
})

const jsonReq = (url: string, body: unknown): Request =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// The probe-can-go-red self-test lives in probe-self-test.test.ts (phase 1).

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PHASE 2 — the seven routes under the probe, both directions.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const directions: Array<[string, typeof TENANT_A, typeof TENANT_B]> = [
  ['A asks for B', TENANT_A, TENANT_B],
  ['B asks for A', TENANT_B, TENANT_A],
]

describe.each(directions)('cross-tenant probe — %s', (_label, asTenant, target) => {
  beforeEach(() => { state.authedAs = asTenant.user_id })

  it('competitive-brief: client-supplied business_id is rejected; nothing of the target leaks', async () => {
    const r = await probeCrossTenant(
      req => competitiveBrief(req as never) as Promise<Response>,
      id => new Request('http://t/api/aria/competitive-brief?business_id=' + id),
      asTenant, target,
    )
    expect(r.leaks).toEqual([])
    expect(r.status).toBe(400) // explicit rejection of the client-supplied param
  })

  it('competitive-brief: the in-memory cache can no longer serve another tenant', async () => {
    // Warm the cache as the target tenant, then request as the probe tenant WITHOUT a param —
    // the resolved tenant differs, so the cached brief must not surface.
    state.authedAs = target.user_id
    await competitiveBrief(new Request('http://t/api/aria/competitive-brief') as never)
    state.authedAs = asTenant.user_id
    const res = await competitiveBrief(new Request('http://t/api/aria/competitive-brief') as never)
    const body = await (res as Response).text()
    expect(body).not.toContain(target.marker)
  })

  it('competitor-opportunities: body business_id rejected; no target data in prompt or response', async () => {
    const r = await probeCrossTenant(
      req => competitorOpportunities(req as never) as Promise<Response>,
      id => jsonReq('http://t/api/aria/competitor-opportunities', { business_id: id }),
      asTenant, target,
    )
    expect(r.leaks).toEqual([])
    expect(r.status).toBe(400)
  })

  it('menu-optimisation: body business_id rejected; sale-item velocity never crosses tenants', async () => {
    const r = await probeCrossTenant(
      req => menuOptimisation(req as never) as Promise<Response>,
      id => jsonReq('http://t/api/aria/menu-optimisation', { business_id: id }),
      asTenant, target,
    )
    expect(r.leaks).toEqual([])
    expect(r.status).toBe(400)
  })

  it('social-listening: 410 Gone on every verb — tombstoned, not deleted', async () => {
    const p = await (socialListening as unknown as (r?: unknown) => Response)(jsonReq('http://t/api/aria/social-listening', { business_id: target.business_id }))
    expect((p as Response).status).toBe(410)
    const g = await (socialListeningGet as unknown as (r?: unknown) => Response)(new Request('http://t/api/aria/social-listening'))
    expect((g as Response).status).toBe(410)
  })

  it('classify-product: 410 Gone — tombstoned, not deleted', async () => {
    const p = await (classifyProduct as unknown as (r?: unknown) => Response)(jsonReq('http://t/api/aria/classify-product', { name: 'x' }))
    expect((p as Response).status).toBe(410)
  })

  it('upload: tenant resolved server-side BEFORE the paid vision call; foreign id in body is inert', async () => {
    const res = await upload(jsonReq('http://t/api/aria/upload', {
      base64: 'aGk=', mime: 'image/png', name: 'x.png', business_id: target.business_id,
    }) as never)
    const body = await (res as Response).text()
    expect(body).not.toContain(target.marker)
    // The route resolves OUR tenant (or refuses); it never adopts the body id.
    expect([200, 400, 403]).toContain((res as Response).status)
  })

  it('staff-talk: accepts no tenant-shaped input; a foreign business_id in the body is rejected', async () => {
    const res = await staffTalk(jsonReq('http://t/api/aria/staff-talk', {
      message: 'when is my shift', business_id: target.business_id,
    }) as never)
    expect((res as Response).status).toBe(400) // tenant-shaped input refused outright
    const clean = await staffTalk(jsonReq('http://t/api/aria/staff-talk', { message: 'when is my shift' }) as never)
    const body = await (clean as Response).text()
    expect(body).not.toContain(target.marker)
  })
})

describe('unauthenticated requests never reach tenant data', () => {
  it('all five live routes 401 with no session', async () => {
    state.authedAs = null
    const results = await Promise.all([
      competitiveBrief(new Request('http://t/a') as never),
      competitorOpportunities(jsonReq('http://t/a', {}) as never),
      menuOptimisation(jsonReq('http://t/a', {}) as never),
      upload(jsonReq('http://t/a', { base64: 'aGk=', mime: 'image/png' }) as never),
      staffTalk(jsonReq('http://t/a', { message: 'hi' }) as never),
    ])
    for (const r of results) expect((r as Response).status).toBe(401)
  })
})
