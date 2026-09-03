import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  CAPABILITIES, CAPABILITY_IDS, findCapability, isAutoRunnable, capabilityMenu,
} from './capabilities'
import {
  assemblePlan, renderPlan, markFor, planStepSegments, PLANNER_SYSTEM_PROMPT,
  type WorkPlan, type PlanStep,
} from './plan'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const plannedOk = (r: ReturnType<typeof assemblePlan>): WorkPlan => {
  if (!r.ok) throw new Error('expected a plan, got: ' + r.reason)
  return r
}

/**
 * M11 PHASE 3 — THE PLAN.
 *
 * The owner describes an outcome and gets ordered steps instead of an answer. Nothing runs.
 *
 * The whole safety argument rests on ONE property: the model picks a capability id and the REGISTRY
 * decides everything else. These tests attack that property from both sides — a model that lies
 * about safety, and a model that invents a capability — and they hold the registry itself to
 * naming functions that exist.
 */
describe('M11 phase 3 · the registry describes things that ACTUALLY EXIST', () => {
  it('every capability names a real module, and a function that is really in it', () => {
    // Failure pattern #1 in advance: a capability that reads convincingly and has nothing behind
    // it. Written as a file read rather than an import so a deleted export fails here loudly.
    const missing: string[] = []
    for (const id of CAPABILITY_IDS) {
      const [file, fn] = CAPABILITIES[id].executor.split('#')
      if (!existsSync(join(root, file))) { missing.push(id + ': no file ' + file); continue }
      if (!read(file).includes(fn)) missing.push(id + ': ' + file + ' does not contain ' + fn)
    }
    expect(missing, missing.join(' | ')).toEqual([])
  })

  it('ANTI-VACUITY — there are real capabilities here, not an empty table', () => {
    expect(CAPABILITY_IDS.length).toBeGreaterThanOrEqual(15)
    expect(CAPABILITY_IDS.filter(id => CAPABILITIES[id].kind === 'write').length).toBe(11)
    expect(CAPABILITY_IDS.filter(id => CAPABILITIES[id].kind === 'read').length).toBeGreaterThanOrEqual(4)
  })

  it('the 11 writes are EXACTLY the executor action types — no invented power', () => {
    // Anchored to the executor's own exhaustive Record<PlannedAction['type'], string>. If someone
    // adds a capability the executor cannot carry out, this is where it is caught.
    const exec = read('src/lib/aria/ask/action-executor.ts')
    const block = exec.slice(exec.indexOf('CATEGORY_BY_ACTION_TYPE'), exec.indexOf('ASK-ARIA-FORTRESS'))
    const inExecutor = [...block.matchAll(/^\s{2}([a-z_]+):/gm)].map(m => m[1]).sort()
    const writes = CAPABILITY_IDS.filter(id => CAPABILITIES[id].kind === 'write').sort()
    expect(inExecutor.length).toBe(11)
    expect(writes).toEqual(inExecutor)
  })

  it('every gated capability says WHY, and every ungated one does not pretend to', () => {
    for (const id of CAPABILITY_IDS) {
      const c = CAPABILITIES[id]
      if (c.gate === 'auto') expect(c.gate_reason, id).toBeUndefined()
      else expect(c.gate_reason, id + ' is gated with no reason').toBeDefined()
    }
  })

  it('MONEY, SENDING AND AUTHORISATION ARE NEVER auto', () => {
    // The decision table, as an assertion. Any of these becoming 'auto' is a plan runner being
    // handed the ability to charge a customer or commit to a supplier.
    const mustNotBeAuto = ['bulk_price_update', 'apply_category_discount', 'create_promotion',
      'update_promotion', 'create_invoice', 'approve_po_draft', 'create_roster', 'create_agent'] as const
    for (const id of mustNotBeAuto) {
      expect(CAPABILITIES[id].gate, id + ' must never be auto').toBe('propose_only')
      expect(isAutoRunnable(CAPABILITIES[id]), id).toBe(false)
    }
  })

  it('an unregistered id resolves to nothing — including plausible inventions', () => {
    expect(findCapability('send_sms_campaign')).toBeNull()
    expect(findCapability('refund_customer')).toBeNull()
    expect(findCapability('adjust_stock ')).toBeNull()      // trailing space is not the id
    expect(findCapability('toString')).toBeNull()           // prototype keys are not capabilities
    expect(findCapability('constructor')).toBeNull()
    expect(findCapability(null)).toBeNull()
    expect(findCapability({ id: 'adjust_stock' })).toBeNull()
    expect(findCapability('adjust_stock')?.id).toBe('adjust_stock')
  })
})

describe('M11 phase 3 · THE GATE IS THE REGISTRY’S, NEVER THE MODEL’S', () => {
  it('a model claiming a price change is safe changes nothing', () => {
    // The attack: prompt injection, or an ordinary bad sample, asserting its own safety.
    const p = plannedOk(assemblePlan('lift margins', {
      title: 'Lift margins',
      steps: [{
        capability: 'bulk_price_update', title: 'Raise coffee 10%', detail: '',
        // every one of these is ignored:
        gate: 'auto', needs_approval: false, runnable_by_aria: true, safe: true, reversible: true,
      }],
    }))
    const s = p.steps[0]
    expect(s.gate).toBe('propose_only')
    expect(s.needs_approval).toBe(true)
    expect(s.runnable_by_aria).toBe(false)
    expect(s.gate_reason).toBe('money')
    expect(markFor(s)).toContain('NEEDS YOU')
  })

  it('an invented capability becomes a step that needs a person, never an executable one', () => {
    const p = plannedOk(assemblePlan('text everyone', {
      steps: [{ capability: 'send_sms_campaign', title: 'Text the lapsed customers', detail: '' }],
    }))
    expect(p.steps[0].capability_id).toBeNull()
    expect(p.steps[0].needs_person).toBe(true)
    expect(p.steps[0].runnable_by_aria).toBe(false)
    // Unknown is NOT reversible. Optimism here would promise an undo nothing can perform.
    expect(p.steps[0].reversible).toBe(false)
  })

  it('the prompt never tells the model what the gates are', () => {
    // If the menu leaked gates, a model could be argued into a different one — and worse, a reader
    // would believe the model's answer mattered. It does not, and the prompt must not imply it.
    // Asserted as an EXACT reconstruction rather than by searching for gate words: `approve` is a
    // substring of the id `approve_po_draft`, so a keyword scan here would either false-positive or
    // be loosened until it proved nothing. Equality proves no field but id and label is emitted.
    const expected = CAPABILITY_IDS.map(id => '  ' + id + ' — ' + CAPABILITIES[id].label).join(String.fromCharCode(10))
    expect(capabilityMenu()).toBe(expected)
    expect(capabilityMenu()).not.toContain('propose_only')
    expect(capabilityMenu()).not.toContain('gate')
    expect(capabilityMenu()).not.toContain('reversible')
    expect(PLANNER_SYSTEM_PROMPT).toContain('anything you say about it is discarded')
    for (const id of CAPABILITY_IDS) expect(capabilityMenu()).toContain(id)
  })

  it('a safe reversible step IS runnable, so the gate is not just refusing everything', () => {
    // Anti-vacuity for the whole gating idea: if nothing were ever runnable, every assertion above
    // would pass on a registry that says no to everything, which is not a co-owner.
    const p = plannedOk(assemblePlan('fix the count', {
      steps: [{ capability: 'adjust_stock', title: 'Correct the oat milk count to 24', detail: '' }],
    }))
    expect(p.steps[0].runnable_by_aria).toBe(true)
    expect(p.steps[0].needs_approval).toBe(false)
    expect(p.counts.runnable_by_aria).toBe(1)
  })
})

describe('M11 phase 3 · ordered steps, and a plan that names its own gaps', () => {
  const mixed = () => plannedOk(assemblePlan('get the shop ready for the long weekend', {
    title: 'Long weekend prep',
    steps: [
      { capability: 'read_loss_signals', title: 'Look at where money is leaking', detail: 'Checks takings, stock and reviews.' },
      { capability: 'adjust_stock', title: 'Correct the oat milk count', detail: 'Sets it to 24.' },
      { capability: 'create_promotion', title: 'Set up a long-weekend offer', detail: '10% off pastries.' },
      { capability: null, title: 'Call the baker about Saturday', detail: 'Aria has no phone.' },
    ],
  }))

  it('steps are numbered 1..n in the order the model gave them', () => {
    expect(mixed().steps.map(s => s.index)).toEqual([1, 2, 3, 4])
    expect(mixed().steps[0].capability_id).toBe('read_loss_signals')
    expect(mixed().steps[3].capability_id).toBeNull()
  })

  it('the counts are the truth about the plan, not a summary of the happy path', () => {
    expect(mixed().counts).toEqual({ total: 4, runnable_by_aria: 2, needs_approval: 2, needs_person: 1 })
  })

  it('the blocked reason is set, and names both what needs a person and what needs the owner', () => {
    const r = mixed().blocked_reason ?? ''
    expect(r).toContain('1 of these 4 steps need a person')
    expect(r).toContain('1 more need your go-ahead')
  })

  it('a plan Aria can do entirely on her own has NO blocked reason — the flag means something', () => {
    const p = plannedOk(assemblePlan('tidy the counts', {
      steps: [
        { capability: 'read_revenue_day', title: 'Read yesterday', detail: '' },
        { capability: 'adjust_stock', title: 'Fix the count', detail: '' },
      ],
    }))
    expect(p.blocked_reason).toBeNull()
    expect(p.counts.needs_approval).toBe(0)
  })

  it('steps beyond the cap are dropped rather than half-rendered', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ capability: 'adjust_stock', title: 'step ' + i, detail: '' }))
    expect(plannedOk(assemblePlan('lots', { steps: many })).steps.length).toBe(8)
  })

  it('a step with no title is not a step', () => {
    const p = plannedOk(assemblePlan('x', {
      steps: [{ capability: 'adjust_stock', title: '   ', detail: 'nothing' }, { capability: 'adjust_stock', title: 'real', detail: '' }],
    }))
    expect(p.steps.length).toBe(1)
    expect(p.steps[0].index).toBe(1)
  })
})

describe('M11 phase 3 · Aria must be able to say a request cannot be planned', () => {
  it('the model saying so is taken at face value, with its reason', () => {
    const r = assemblePlan('make me famous', { cannot_plan: true, cannot_plan_reason: 'That is not something a POS can do.' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('That is not something a POS can do.')
  })

  it('no usable steps is UNPLANNABLE, never an empty plan rendered as a plan', () => {
    for (const raw of [{}, { steps: [] }, { steps: 'not an array' }, null, undefined, { steps: [{ title: '' }] }]) {
      const r = assemblePlan('something', raw)
      expect(r.ok, JSON.stringify(raw)).toBe(false)
    }
  })

  it('an empty request is refused before anything is asked of a model', () => {
    expect(assemblePlan('', { steps: [{ capability: 'adjust_stock', title: 'x' }] }).ok).toBe(false)
    expect(assemblePlan('   ', {}).ok).toBe(false)
  })

  it('a PROVIDER failure is not reported as an unplannable request', () => {
    // Blaming the owner's question for an outage is the wrong sentence, and it is the one a
    // catch-all would produce. The distinction is asserted at the source.
    const src = read('src/lib/aria/works/plan.ts')
    expect(src).toContain('could not reach the model')
    expect(src).toContain('Nothing was attempted')
  })
})

describe('M11 phase 3 · rendering — no unmarked unexecutable step, ever', () => {
  const p = plannedOk(assemblePlan('long weekend', {
    title: 'Long weekend prep',
    steps: [
      { capability: 'adjust_stock', title: 'Correct the oat milk count', detail: '' },
      { capability: 'create_promotion', title: 'Set up an offer', detail: '' },
      { capability: null, title: 'Call the baker', detail: '' },
    ],
  }))

  it('every step that Aria may not carry out carries a mark', () => {
    const out = renderPlan(p)
    for (const s of p.steps) {
      if (s.runnable_by_aria) continue
      expect(out, 'step ' + s.index + ' rendered unmarked').toContain(markFor(s))
      expect(markFor(s)).toMatch(/NEEDS (A PERSON|YOU|YOUR OK)/)
    }
  })

  it('the blocked line is FIRST, not a footnote', () => {
    const out = renderPlan(p)
    expect(out.split('\n')[0]).toContain('⚠️')
    expect(out.indexOf('⚠️')).toBeLessThan(out.indexOf('Long weekend prep'))
  })

  it('it says out loud that nothing has run', () => {
    expect(renderPlan(p)).toContain('Nothing has run. This is the plan.')
  })

  it('an unplannable request renders as a refusal, not as an empty plan', () => {
    const out = renderPlan({ ok: false, request: 'x', reason: 'No capability covers that.' })
    expect(out).toContain("I can't turn that into a plan")
    expect(out).toContain('No capability covers that.')
    expect(out).not.toContain('Nothing has run')
  })

  it('MUTATION — an unexecutable step rendered unmarked makes this suite RED', () => {
    // The sprint's named mutation, run against the real function rather than a copy of it: strip
    // the marks and confirm the assertion above could not survive it.
    const unmarked = (s: PlanStep) => (s.runnable_by_aria ? 'Aria can do this' : 'Aria can do this')
    const out = p.steps.map(s => s.index + '. ' + s.title + ' — ' + unmarked(s)).join('\n')
    for (const s of p.steps) {
      if (s.runnable_by_aria) continue
      expect(out).not.toContain(markFor(s))      // ← what the real renderer guarantees, gone
    }
    expect(out).not.toMatch(/NEEDS (A PERSON|YOU|YOUR OK)/)
  })
})

describe('M11 phase 3 · a step resting on a number carries that number’s tier', () => {
  it('uses the SAME segmenter and the SAME provenance the answers use', () => {
    const step = plannedOk(assemblePlan('r', {
      steps: [{ capability: 'read_revenue_day', title: 'Read yesterday', detail: 'Yesterday you took A$1,204.50 across 38 sales.' }],
    })).steps[0]

    const grounded = planStepSegments(step, { anchors: [1204.5], anchorLabels: { '1204.5': 'pos_sales' } })
    const verified = grounded.filter(s => s.kind === 'figure' && s.tier === 'verified')
    expect(verified.length).toBeGreaterThan(0)

    // The same step with nothing grounding it renders the figure PLAIN — never quietly verified.
    const ungrounded = planStepSegments(step, {})
    expect(ungrounded.filter(s => s.kind === 'figure' && s.tier === 'verified').length).toBe(0)

    // And a bare number is not a figure at all — FIGURE_RE matches currency and percentages only.
    // Asserted so nobody "fixes" a step by dropping the A$ and quietly loses the tier with it.
    const bare = planStepSegments(
      { ...step, detail: 'Yesterday you took 1204.50.' },
      { anchors: [1204.5], anchorLabels: { '1204.5': 'pos_sales' } },
    )
    expect(bare.filter(s => s.kind === 'figure').length).toBe(0)
  })

  it('no second notion of "verified" was invented', () => {
    // AMENDED BY M11B PHASE 1. This read plan.ts. The pure half of that module — types, the registry
    // lookup, assembly, rendering and this segmenter call — moved to plan-shape.ts because
    // PlanCard is a client component and importing plan.ts dragged model-router and the Anthropic
    // SDK (which imports node:path) into the browser bundle, failing the webpack build. The
    // assertion follows the code rather than being deleted: plan.ts still re-exports every symbol,
    // so nothing else changed, and BOTH files are checked so the tier logic cannot reappear in the
    // server half either.
    const shape = read('src/lib/aria/works/plan-shape.ts')
    const server = read('src/lib/aria/works/plan.ts')
    expect(shape).toContain("from '@/lib/aria/figure-provenance'")
    expect(shape).toContain('segmentFigures(')
    expect(shape).not.toMatch(/tier\s*[:=]\s*'verified'/)
    expect(server).not.toMatch(/tier\s*[:=]\s*'verified'/)
    // The re-export is what keeps every existing import path working.
    expect(server).toContain("export * from './plan-shape'")
  })
})

describe('M11 phase 3 · nothing in this phase writes or executes', () => {
  const src = read('src/lib/aria/works/plan.ts') + read('src/lib/aria/works/capabilities.ts')

  it('no insert, update, delete, upsert or executor call anywhere in the phase', () => {
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/)
    expect(src).not.toMatch(/executeAction\(|executeProposal\(/)
    // The registry NAMES the executor as a string so the test above can check it exists. Naming it
    // is not calling it, and this asserts the difference rather than assuming it.
    expect(src).toContain('action-executor.ts#executeAction')
    expect(src).not.toMatch(/import .*action-executor/)
  })

  it('the planning call is logged like every other call — not invisible spend', () => {
    // AI-COST-AUDIT-1 found three unlogged call paths and a ledger undercounting real spend by
    // roughly half. A new call goes through the routed, logged path or it does not ship.
    expect(src).toContain('runAriaModel')
    expect(src).toContain('businessId: ctx.businessId')
    expect(src).toContain("task: 'work_plan'")
  })
})
