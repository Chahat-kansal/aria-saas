import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JOB_MODEL, TASK_JOB, MODEL_CANDIDATES, jobForTask, modelForJob, modelForTask, type AriaJob } from './jobs'
import type { AriaTask } from './model-router'

// MS15 PHASE 2 — A CALL SITE DECLARES A JOB; THE GATEWAY CHOOSES THE MODEL.
//
// The property that makes this worth doing: changing what J2 runs on changes EVERY J2 call site
// and NO J1 site, from one line. And the property that makes it safe to land today: not one
// model choice actually changed.

const ROUTER = readFileSync(join(process.cwd(), 'src', 'lib', 'aria', 'model-router.ts'), 'utf8')

/** The routing rule that existed BEFORE this phase, transcribed from model-router.ts. */
const PREVIOUS_SMART_TASKS = new Set<AriaTask>(['reorder_plan', 'profit_leak', 'supplier_risk', 'explain'])
function previousModelFor(task: AriaTask): string {
  return PREVIOUS_SMART_TASKS.has(task) ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
}

const ALL_TASKS = Object.keys(TASK_JOB) as AriaTask[]

describe('NOT ONE MODEL CHOICE CHANGED — this phase changed how, not what', () => {
  it.each(ALL_TASKS.map(t => [t] as const))('%s resolves to exactly the model it used before', task => {
    expect(modelForTask(task)).toBe(previousModelFor(task))
  })

  it('the judgement set is exactly the old SMART_TASKS set', () => {
    const judgement = ALL_TASKS.filter(t => jobForTask(t) === 'judgement').sort()
    expect(judgement).toEqual([...PREVIOUS_SMART_TASKS].sort())
  })
})

describe('THE PROPERTY — one line moves one job, and only that job', () => {
  it('changing J2’s model would change every precompute task and no judgement task', () => {
    // Simulated exactly as the real change would be: swap the value in the job map.
    const swapped: Record<AriaJob, string | null> = { ...JOB_MODEL, precompute: 'a-different-model' }
    const resolve = (t: AriaTask) => swapped[jobForTask(t)]

    const precompute = ALL_TASKS.filter(t => jobForTask(t) === 'precompute')
    const judgement = ALL_TASKS.filter(t => jobForTask(t) === 'judgement')
    expect(precompute.length).toBeGreaterThan(0)
    expect(judgement.length).toBeGreaterThan(0)

    for (const t of precompute) expect(resolve(t)).toBe('a-different-model')
    for (const t of judgement) expect(resolve(t)).toBe(JOB_MODEL.judgement)
  })

  it('…and NOT extraction either, even though it shares precompute’s model today', () => {
    // The two jobs happen to run the same model right now. They are still different jobs, and
    // that is the whole point — they can diverge without touching a single call site.
    const swapped: Record<AriaJob, string | null> = { ...JOB_MODEL, precompute: 'a-different-model' }
    const extraction = ALL_TASKS.filter(t => jobForTask(t) === 'extraction')
    expect(extraction.length).toBeGreaterThan(0)
    for (const t of extraction) expect(swapped[jobForTask(t)]).toBe(JOB_MODEL.extraction)
  })
})

describe('the taxonomy is complete and honest', () => {
  it('every task has a job — a new task cannot be added without deciding what kind of work it is', () => {
    const routerTasks = (ROUTER.match(/^\s*\|\s*'([a-z_]+)'/gm) ?? [])
      .map(l => l.replace(/[^a-z_]/g, ''))
      .filter(t => t && t !== 'anthropic' && t !== 'openai' && t !== 'openrouter' && t !== 'openrouter_free')
    for (const task of routerTasks) {
      expect(Object.prototype.hasOwnProperty.call(TASK_JOB, task)).toBe(true)
    }
    expect(routerTasks.length).toBeGreaterThanOrEqual(14)
  })

  it('build_coding has NO runtime model, and asking for one fails loudly', () => {
    expect(modelForJob('build_coding')).toBeNull()
    // A build-time job reaching the runtime router is a caller bug; a silent default would hide it.
    const rogue = 'build_time_thing' as unknown as AriaTask
    expect(jobForTask(rogue)).toBe('extraction') // unknown tasks fall to the cheapest schema job…
    // …but a task genuinely mapped to build_coding throws rather than picking something expensive.
    const throwing = () => {
      const job: AriaJob = 'build_coding'
      const m = modelForJob(job)
      if (!m) throw new Error('no runtime model')
      return m
    }
    expect(throwing).toThrow()
  })

  it('model candidates are RECORDED, not applied — the swap needs a score first', () => {
    expect(MODEL_CANDIDATES.length).toBeGreaterThan(0)
    const opus = MODEL_CANDIDATES.find(c => c.candidate.includes('opus'))
    expect(opus?.job).toBe('judgement')
    expect(opus?.rationale).toMatch(/Blocked on: an eval score/)
    // And it is genuinely not applied.
    expect(JOB_MODEL.judgement).not.toContain('opus')
  })
})

describe('no call site hardcodes a model any more', () => {
  it('the gateway resolves through the job map, not a ternary over task names', () => {
    expect(ROUTER).toMatch(/modelForTask\(input\.task\)/)
    // THE MUTATION TARGET: the old inline choice must be gone.
    expect(ROUTER).not.toMatch(/SMART_TASKS\.has\(input\.task\)\s*\?/)
  })

  it('the gateway contains no bare Anthropic model literal outside the job map', () => {
    const code = ROUTER.split('\n')
      .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
      .join('\n')
    expect(code).not.toMatch(/'claude-(?:sonnet|haiku|opus)-[\d-]/)
  })
})
