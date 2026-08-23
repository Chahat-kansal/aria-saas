import { describe, it, expect, vi } from 'vitest'

// MS13 PHASE 3 — NO TENANT IN ANY TOOL SCHEMA (V3).
//
// The model must never be offered a tenant-shaped parameter: the EXECUTOR injects business_id
// from its closure, so a prompt-injected "use business_id X" has nothing to bind to. The audit
// found all 30 schemas already clean (strip count: 0) — this guard keeps it that way.
//
// The guard WALKS THE LIVE OBJECT (import + recursive walk), not a regex over the file text —
// MS12's backspace incident proved a pattern you never probed can silently match nothing. The
// mutation check below is the probe: re-adding a business_id param to one schema goes red.

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }))

import { ARIA_POS_TOOLS } from '@/lib/aria-tools'

const TENANT_SHAPED = /^(business_?id|tenant_?id|tenant|bid|org_?id|company_?id)$/i

function collectParamNames(schema: unknown, path: string, out: string[]): void {
  if (schema == null || typeof schema !== 'object') return
  const s = schema as Record<string, unknown>
  if (s.properties && typeof s.properties === 'object') {
    for (const [key, val] of Object.entries(s.properties as Record<string, unknown>)) {
      out.push(path + '.' + key)
      collectParamNames(val, path + '.' + key, out)
    }
  }
  if (s.items) collectParamNames(s.items, path + '[]', out)
}

describe('tool schemas carry no tenant-shaped parameter', () => {
  it('walks every input_schema of every tool — zero tenant params', () => {
    expect(ARIA_POS_TOOLS.length).toBeGreaterThanOrEqual(25) // the walk is over the real set
    const offenders: string[] = []
    for (const tool of ARIA_POS_TOOLS as Array<{ name: string; input_schema?: unknown }>) {
      const names: string[] = []
      collectParamNames(tool.input_schema, tool.name, names)
      for (const n of names) {
        const leaf = n.split('.').pop() ?? ''
        if (TENANT_SHAPED.test(leaf)) offenders.push(n)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the walker itself sees parameters (it cannot pass vacuously)', () => {
    // Guard-of-the-guard: prove the walker extracts names from a real schema, so an empty
    // offenders list means "no tenant params", never "walked nothing" (MS12 lesson).
    const names: string[] = []
    collectParamNames({ properties: { business_id: { type: 'string' }, nested: { properties: { tenant: {} } } } }, 't', names)
    expect(names).toContain('t.business_id')
    expect(names).toContain('t.nested.tenant')
    const sampled: string[] = []
    collectParamNames((ARIA_POS_TOOLS[0] as { input_schema?: unknown }).input_schema, 'first', sampled)
    expect(sampled.length).toBeGreaterThan(0)
  })
})
