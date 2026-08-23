/**
 * MS13 PHASE 1 — THE TWO-TENANT FIXTURE.
 *
 * Only 2 non-test businesses exist live, so this fixture seeds its own second tenant rather than
 * assuming one. It provides an in-memory Supabase fake with TWO tenants whose rows are
 * distinguishable at a glance, plus a reusable cross-tenant probe: authenticate as tenant A's
 * owner, request tenant B's id, and assert the response contains none of B's data — in BOTH
 * directions.
 *
 * The fake is deliberately PERMISSIVE about RLS: a session-client read that the route does not
 * scope by business_id returns every tenant's rows. That models the documented worst case (the
 * ask prompt itself records "28+ tables with zero policies") — the exact condition under which
 * server-side tenant resolution must hold on its own. A route is only "fixed" when the probe
 * passes with RLS assumed absent.
 *
 * Every later agent test (MS13 phases 4–6) reuses this fixture; it is permanent.
 */

export interface TenantSeed {
  business_id: string
  user_id: string
  business_name: string
  /** A marker string that appears in every one of this tenant's rows — leak detection greps for it. */
  marker: string
}

export const TENANT_A: TenantSeed = {
  business_id: 'aaaaaaaa-0000-0000-0000-00000000000a',
  user_id: 'aaaaaaaa-1111-0000-0000-00000000000a',
  business_name: 'Sip Fixture Cafe',
  marker: 'TENANT_A_SECRET',
}

export const TENANT_B: TenantSeed = {
  business_id: 'bbbbbbbb-0000-0000-0000-00000000000b',
  user_id: 'bbbbbbbb-1111-0000-0000-00000000000b',
  business_name: 'Rival Fixture Bar',
  marker: 'TENANT_B_SECRET',
}

type Row = Record<string, unknown>

/** The seeded dataset. Tables the seven routes read, with rows for BOTH tenants. */
export function seedTables(): Record<string, Row[]> {
  const t = (seed: TenantSeed): Record<string, Row[]> => ({
    businesses: [{ id: seed.business_id, user_id: seed.user_id, name: seed.business_name, suburb: seed.marker + '_suburb', city: 'Melbourne', industry: 'cafe', is_active: true }],
    user_active_business: [{ user_id: seed.user_id, business_id: seed.business_id }],
    competitor_snapshots: [{ business_id: seed.business_id, competitor_name: seed.marker + '_competitor', rating: 4.2, review_count: 10, price_index: 1, snapshot_date: new Date().toISOString(), created_at: new Date().toISOString() }],
    aria_competitor_alerts: [{ business_id: seed.business_id, competitor_name: seed.marker + '_competitor', alert_type: 'price', message: seed.marker + '_alert', created_at: new Date().toISOString() }],
    aria_competitor_watches: [{ business_id: seed.business_id, competitor_name: seed.marker + '_watch', is_active: true }],
    recipes: [{ id: seed.business_id + '-r1', business_id: seed.business_id, name: seed.marker + '_recipe', cost_per_serve: 2, menu_price: 10, margin_percent: 80, linked_product_id: seed.business_id + '-p1' }],
    pos_sale_items: [{ business_id: seed.business_id, product_id: seed.business_id + '-p1', quantity: 40, pos_sales: { business_id: seed.business_id, created_at: new Date().toISOString() } }],
    aria_skills: [],
    aria_ai_calls: [],
    aria_conversations: [],
  })
  const a = t(TENANT_A)
  const b = t(TENANT_B)
  const merged: Record<string, Row[]> = {}
  for (const key of Object.keys(a)) merged[key] = [...a[key], ...(b[key] ?? [])]
  return merged
}

export interface FakeDb {
  tables: Record<string, Row[]>
  /** Every insert/update captured, for assertions like "reject persisted nothing". */
  writes: Array<{ table: string; op: 'insert' | 'update' | 'upsert' | 'delete'; payload: unknown }>
}

/**
 * A chainable Supabase fake. Honors eq/in filters (including dotted paths), gte/lt loosely,
 * limit, order, maybeSingle/single. UNKNOWN filters are ignored (permissive) — see header.
 */
export function makeFakeClient(db: FakeDb, authedUserId: string | null) {
  function query(table: string) {
    let rows: Row[] = [...(db.tables[table] ?? [])]
    const chain: Record<string, unknown> = {
      select() { return chain },
      eq(col: string, val: unknown) {
        rows = rows.filter(r => {
          const v = col.includes('.') ? col.split('.').reduce<unknown>((o, k) => (o as Row | null)?.[k], r) : r[col]
          return v === val
        })
        return chain
      },
      in(col: string, vals: unknown[]) { rows = rows.filter(r => (vals ?? []).includes(r[col])); return chain },
      gte() { return chain },
      lt() { return chain },
      gt() { return chain },
      is() { return chain },
      not() { return chain },
      ilike() { return chain },
      order() { return chain },
      limit(n: number) { rows = rows.slice(0, n); return chain },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }) },
      single() { return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'no rows' } }) },
      insert(payload: unknown) {
        db.writes.push({ table, op: 'insert', payload })
        const arr = Array.isArray(payload) ? payload : [payload]
        db.tables[table] = [...(db.tables[table] ?? []), ...(arr as Row[])]
        const ins: Record<string, unknown> = {
          select() { return ins },
          single() { return Promise.resolve({ data: { id: 'new-' + table, ...(arr[0] as Row) }, error: null }) },
          maybeSingle() { return Promise.resolve({ data: { id: 'new-' + table, ...(arr[0] as Row) }, error: null }) },
          then(res: (v: unknown) => unknown) { return Promise.resolve({ data: null, error: null }).then(res) },
        }
        return ins
      },
      update(payload: unknown) { db.writes.push({ table, op: 'update', payload }); return chain },
      upsert(payload: unknown) { db.writes.push({ table, op: 'upsert', payload }); return chain },
      delete() { db.writes.push({ table, op: 'delete', payload: null }); return chain },
      then(resolve: (v: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      },
    }
    return chain
  }
  return {
    from: (table: string) => query(table),
    auth: {
      getUser: () => Promise.resolve(
        authedUserId
          ? { data: { user: { id: authedUserId, email: authedUserId + '@fixture.test' } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
      ),
    },
  }
}

/**
 * THE PROBE. Call a route handler authenticated as `as`, asking for `target`'s tenant id, and
 * assert none of the target's marker strings appear in the response. Run it in BOTH directions.
 * Returns the leaked marker occurrences so a test can assert `leaks.length === 0` — or, for a
 * known-leaking route, assert it is NON-zero (a probe that passes against a leaking route is
 * not a probe).
 */
export async function probeCrossTenant(
  handler: (req: Request) => Promise<Response>,
  makeReq: (targetBusinessId: string) => Request,
  as: TenantSeed,
  target: TenantSeed,
): Promise<{ status: number; body: string; leaks: string[] }> {
  const res = await handler(makeReq(target.business_id))
  const body = await res.text()
  const leaks: string[] = []
  let i = -1
  while ((i = body.indexOf(target.marker, i + 1)) !== -1) leaks.push(target.marker + '@' + i)
  return { status: res.status, body, leaks }
}
