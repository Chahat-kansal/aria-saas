import { describe, it, expect, beforeEach } from 'vitest'
import { seedTables, makeFakeClient, probeCrossTenant, TENANT_A, TENANT_B, type FakeDb } from './two-tenant-fixture'

// MS13 PHASE 1 — THE PROBE MUST BE ABLE TO GO RED.
//
// A probe that passes against a known-leaking route is not a probe. This file runs the
// cross-tenant probe against the EXACT pre-fix leak shape (a client-supplied business_id trusted
// straight into a data read — the shape competitive-brief/competitor-opportunities/
// menu-optimisation all had before phase 2) and requires the probe to DETECT the leak, forever.
//
// PHASE-1 RECORD: pointed at the real, unfixed routes on 2026-08-22 the full probe suite failed
// 12 of 12 route expectations (both directions) — that red run is the fixture's birth
// certificate. The route expectations themselves live in tenant-isolation.test.ts and went green
// with the phase-2 fixes.

const db: FakeDb = { tables: seedTables(), writes: [] }

beforeEach(() => {
  db.tables = seedTables()
  db.writes = []
})

describe('probe self-test', () => {
  type Chain = { select: (c: string) => Chain; eq: (c: string, v: unknown) => Chain } & PromiseLike<{ data: unknown }>

  async function leakyHandler(req: Request): Promise<Response> {
    // The pre-fix shape: client-supplied tenant id, straight into the read.
    const client = makeFakeClient(db, TENANT_A.user_id)
    const business_id = new URL(req.url).searchParams.get('business_id')
    const chain = client.from('competitor_snapshots') as unknown as Chain
    const { data } = await chain.select('competitor_name').eq('business_id', business_id)
    return new Response(JSON.stringify({ data }), { status: 200 })
  }

  async function fixedHandler(_req: Request): Promise<Response> {
    // The post-fix shape: tenant resolved server-side; the request's id is never consulted.
    const client = makeFakeClient(db, TENANT_A.user_id)
    const chain = client.from('competitor_snapshots') as unknown as Chain
    const { data } = await chain.select('competitor_name').eq('business_id', TENANT_A.business_id)
    return new Response(JSON.stringify({ data }), { status: 200 })
  }

  it('detects the leak in the unfixed shape — the probe can go red', async () => {
    const r = await probeCrossTenant(leakyHandler, id => new Request('http://t/api?business_id=' + id), TENANT_A, TENANT_B)
    expect(r.leaks.length).toBeGreaterThan(0)
  })

  it('and both directions', async () => {
    const r = await probeCrossTenant(leakyHandler, id => new Request('http://t/api?business_id=' + id), TENANT_B, TENANT_A)
    expect(r.leaks.length).toBeGreaterThan(0)
  })

  it('passes the fixed shape without leaking its own tenant marker check', async () => {
    const r = await probeCrossTenant(fixedHandler, id => new Request('http://t/api?business_id=' + id), TENANT_A, TENANT_B)
    expect(r.leaks).toEqual([])
  })

  it('the fixture seeds two fully distinguishable tenants', () => {
    const tables = seedTables()
    for (const rows of Object.values(tables)) {
      for (const row of rows) {
        const json = JSON.stringify(row)
        // No row carries both markers — a leak is always attributable.
        expect(json.includes(TENANT_A.marker) && json.includes(TENANT_B.marker)).toBe(false)
      }
    }
    expect(tables.businesses.length).toBe(2)
  })
})
