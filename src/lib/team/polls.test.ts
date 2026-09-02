import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── The fake Supabase surface. Only the chain shapes polls.ts actually uses. ───────────────────
type Res = { data?: unknown; error?: unknown }
const state: {
  pollRow: Res
  voteInsert: Res
  votesSelect: Res
  updateRes: Res
  inserted: Array<Record<string, unknown>>
  updates: Array<Record<string, unknown>>
} = { pollRow: {}, voteInsert: {}, votesSelect: {}, updateRes: {}, inserted: [], updates: [] }

vi.mock('@/lib/supabase-admin', () => {
  // `.select().eq()` is used two ways in polls.ts: chained again then .maybeSingle() (the poll
  // lookup), and awaited directly (the votes lookup). This object is BOTH — chainable and
  // thenable — so one fake serves both without branching on the table name.
  const eqNode = () => {
    const node: Record<string, unknown> = {
      eq: () => ({ maybeSingle: async () => state.pollRow }),
      maybeSingle: async () => state.pollRow,
      then: (res: (v: unknown) => unknown) => Promise.resolve(state.votesSelect).then(res),
    }
    return node
  }
  const api = {
    from() {
      return {
        select: () => ({ eq: eqNode }),
        insert: async (row: Record<string, unknown>) => {
          state.inserted.push(row)
          return state.voteInsert
        },
        update: (patch: Record<string, unknown>) => {
          state.updates.push(patch)
          return {
            eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => state.updateRes }) }) }),
          }
        },
      }
    },
  }
  return { supabaseAdmin: api }
})

vi.mock('@/lib/decisions/createDecision', () => ({
  createDecision: vi.fn(async () => 'created-decision-id'),
}))
vi.mock('@/lib/moat/recordEvent', () => ({ recordEvent: vi.fn(async () => undefined) }))

import { castVote, closePoll, domainForSubject, priorityForDomain } from './polls'
import { createDecision } from '@/lib/decisions/createDecision'
import { createPoll } from './polls'

const OPEN_POLL = {
  data: {
    id: 'p1', business_id: 'b1', kind: 'team_poll', status: 'pending',
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    action_data: { options: [{ key: 'early' }, { key: 'late' }] },
  },
  error: null,
}

beforeEach(() => {
  state.pollRow = OPEN_POLL
  state.voteInsert = { error: null }
  state.inserted = []
  state.updates = []
  state.votesSelect = { data: [], error: null }
  state.updateRes = { data: { id: 'p1' }, error: null }
  vi.clearAllMocks()
})

describe('TS-1 phase 3 · a duplicate vote is an ANSWER, not a 500', () => {
  it('23505 returns { ok:false, reason:"already_voted" } and does not throw', async () => {
    // The exact code production returned in the live proof:
    //   23505: duplicate key value violates unique constraint
    //          "team_poll_votes_poll_id_staff_member_id_key"
    state.voteInsert = { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
    const r = await castVote('p1', 'staff-1', 'early')
    expect(r).toEqual({ ok: false, reason: 'already_voted' })
  })

  it('a FIRST vote succeeds and writes exactly the four columns', async () => {
    const r = await castVote('p1', 'staff-1', 'early')
    expect(r).toEqual({ ok: true, option_key: 'early' })
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toEqual({
      business_id: 'b1', poll_id: 'p1', staff_member_id: 'staff-1', option_key: 'early',
    })
  })

  it('ANY OTHER error code is NOT swallowed as "already voted"', () => {
    // The failure this guards: `catch → already_voted` would report a dead database as a
    // successful duplicate, and the voter would be told their vote counted.
    return (async () => {
      state.voteInsert = { error: { code: '08006', message: 'connection failure' } }
      const r = await castVote('p1', 'staff-1', 'early')
      expect(r).toEqual({ ok: false, reason: 'error', message: 'connection failure' })
    })()
  })

  it('an unknown option never reaches the insert', async () => {
    const r = await castVote('p1', 'staff-1', 'sideways')
    expect(r).toEqual({ ok: false, reason: 'unknown_option' })
    expect(state.inserted).toHaveLength(0)
  })

  it('a closed poll never reaches the insert — by status AND by time, separately', async () => {
    state.pollRow = { data: { ...OPEN_POLL.data, status: 'executed' }, error: null }
    expect(await castVote('p1', 'staff-1', 'early')).toEqual({ ok: false, reason: 'poll_closed' })
    expect(state.inserted).toHaveLength(0)

    // Different arm: status is still pending, but the close time has passed.
    state.pollRow = {
      data: { ...OPEN_POLL.data, status: 'pending', expires_at: new Date(Date.now() - 1000).toISOString() },
      error: null,
    }
    expect(await castVote('p1', 'staff-1', 'early')).toEqual({ ok: false, reason: 'poll_closed' })
    expect(state.inserted).toHaveLength(0)
  })

  it('a read error is reported, never collapsed into "not found"', async () => {
    state.pollRow = { data: null, error: { message: 'boom' } }
    expect(await castVote('p1', 'staff-1', 'early')).toEqual({ ok: false, reason: 'error', message: 'boom' })
  })
})

describe('TS-1 phase 3 · the standing rulings are encoded, not remembered', () => {
  it('domain comes from the subject, defaulting to people', () => {
    expect(domainForSubject('roster')).toBe('people')
    expect(domainForSubject('menu')).toBe('money')
    expect(domainForSubject('price')).toBe('money')
    expect(domainForSubject('supplier')).toBe('supply')
    expect(domainForSubject('other')).toBe('people')
    expect(domainForSubject(undefined)).toBe('people')
  })

  it('priority is routine unless the domain is money — and never a value outside the CHECK', () => {
    expect(priorityForDomain('money')).toBe('important')
    for (const d of ['people', 'growth', 'supply', 'compliance'] as const) {
      expect(priorityForDomain(d)).toBe('routine')
    }
    const allowed = ['urgent', 'important', 'routine']
    for (const d of ['money', 'people', 'growth', 'supply', 'compliance'] as const) {
      expect(allowed).toContain(priorityForDomain(d))
    }
  })

  it('a poll is created through createDecision — the EXISTING propose path', async () => {
    const id = await createPoll({
      business_id: 'b1', title: 'Early or late?', closes_at: '2026-09-03T00:00:00Z',
      subject: 'menu', options: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
    })
    expect(id).toBe('created-decision-id')
    const arg = vi.mocked(createDecision).mock.calls[0]![0]
    expect(arg.kind).toBe('team_poll')
    expect(arg.domain).toBe('money')          // menu → money, per the ruling
    expect(arg.priority).toBe('important')    // money → not routine
    expect(arg.expires_at).toBe('2026-09-03T00:00:00Z')
    expect(arg.actor).toBe('staff')
  })

  it('a poll with fewer than two options, or duplicate keys, is REFUSED', async () => {
    expect(await createPoll({
      business_id: 'b1', title: 'x', closes_at: '2026-09-03T00:00:00Z',
      options: [{ key: 'a', label: 'A' }],
    })).toBeNull()
    expect(await createPoll({
      business_id: 'b1', title: 'x', closes_at: '2026-09-03T00:00:00Z',
      options: [{ key: 'a', label: 'A' }, { key: 'a', label: 'Also A' }],
    })).toBeNull()
    expect(vi.mocked(createDecision)).not.toHaveBeenCalled()
  })
})

describe('TS-1 phase 3 · uniqueness is the database’s job', () => {
  const src = strip(read('src/lib/team/polls.ts'))

  it('ANTI-VACUITY — the file was read', () => {
    expect(src.length).toBeGreaterThan(1500)
    expect(src).toContain('castVote')
  })

  it('THE RAIL — there is no check-then-insert anywhere in this module', () => {
    // A "have they voted?" SELECT is a race by construction: two requests both read "no",
    // both insert, and the constraint you were pre-empting is the only thing that saves you.
    expect(src, 'a pre-flight vote lookup appeared')
      .not.toMatch(/from\('team_poll_votes'\)[\s\S]{0,200}?\.eq\('staff_member_id'/)
    // The insert is plain — no ON CONFLICT suppression hiding the outcome from the caller.
    expect(src).not.toMatch(/onConflict/)
    expect(src).toContain("'23505'")
  })

  it('the actor unions were widened, not replaced', () => {
    const rec = read('src/lib/moat/recordEvent.ts')
    const cd = read('src/lib/decisions/createDecision.ts')
    expect(rec).toContain("'aria' | 'owner' | 'cron' | 'staff'")
    expect(cd).toContain("'aria' | 'cron' | 'owner' | 'staff'")
    // Widened, not narrowed: every pre-existing member survives.
    for (const a of ['aria', 'owner', 'cron']) {
      expect(rec).toContain(`'${a}'`)
      expect(cd).toContain(`'${a}'`)
    }
  })

  it('no select(*) — staff_members carries TFN and bank details', () => {
    expect(src).not.toMatch(/\.select\('\*'\)/)
    expect(src).toContain('POLL_COLUMNS')
  })
})

describe('TS-1 phase 4 · closing a poll PROPOSES; it never executes and never spends', () => {
  const WITH_DRAFTS = {
    data: {
      id: 'p1', business_id: 'b1', kind: 'team_poll', status: 'pending', domain: 'people',
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      action_data: {
        options: [
          { key: 'early', label: 'Early', drafts: [{ kind: 'roster_publish', title: 'Publish early roster' }] },
          { key: 'late', label: 'Late' },
        ],
      },
    },
    error: null,
  }

  it('a WINNER drafts through createDecision with NO status and NO amount_cents', async () => {
    state.pollRow = WITH_DRAFTS
    state.votesSelect = { data: [{ option_key: 'early' }, { option_key: 'early' }], error: null }
    const r = await closePoll('p1')

    expect(r).toMatchObject({ ok: true, outcome: 'winner', winner: 'early', drafted: ['created-decision-id'] })
    const arg = vi.mocked(createDecision).mock.calls[0]![0]
    expect(arg.kind).toBe('roster_publish')
    // THE TWO OMISSIONS THAT MATTER. `status` absent → createDecision's 'pending' default stands.
    // `amount_cents` absent → a poll cannot commit money. Neither is "validated to a safe value";
    // both are simply never passed.
    expect(Object.prototype.hasOwnProperty.call(arg, 'status')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(arg, 'amount_cents')).toBe(false)
    // the draft carries its provenance so the decision is traceable to the vote that caused it
    expect(arg.payload).toMatchObject({ from_poll: 'p1', winning_option: 'early' })
    expect(arg.aria_reason).toContain('2 of 2 votes')
  })

  it('the poll row leaves pending, so the phase-2 sweep can never touch it afterwards', async () => {
    state.pollRow = WITH_DRAFTS
    state.votesSelect = { data: [{ option_key: 'early' }], error: null }
    await closePoll('p1')
    expect(state.updates[0]!.status).toBe('executed')
    expect(state.updates[0]!.status).not.toBe('pending')
  })

  it('A TIE DRAFTS NOTHING and invents no winner', async () => {
    state.pollRow = WITH_DRAFTS
    state.votesSelect = { data: [{ option_key: 'early' }, { option_key: 'late' }], error: null }
    const r = await closePoll('p1')
    expect(r).toMatchObject({ ok: true, outcome: 'tie', tied: ['early', 'late'] })
    expect(r).not.toHaveProperty('winner')
    expect(vi.mocked(createDecision)).not.toHaveBeenCalled()
    expect(state.updates[0]!.status).toBe('dismissed')
  })

  it('NO VOTES drafts nothing', async () => {
    state.pollRow = WITH_DRAFTS
    state.votesSelect = { data: [], error: null }
    const r = await closePoll('p1')
    expect(r).toMatchObject({ ok: true, outcome: 'no_votes' })
    expect(vi.mocked(createDecision)).not.toHaveBeenCalled()
    expect(state.updates[0]!.status).toBe('dismissed')
  })

  it('a winning option with no draft spec closes cleanly and drafts nothing', async () => {
    state.pollRow = {
      data: { ...WITH_DRAFTS.data, action_data: { options: [{ key: 'a' }, { key: 'b' }] } },
      error: null,
    }
    state.votesSelect = { data: [{ option_key: 'a' }], error: null }
    const r = await closePoll('p1')
    expect(r).toMatchObject({ ok: true, outcome: 'winner', winner: 'a', drafted: [] })
    expect(vi.mocked(createDecision)).not.toHaveBeenCalled()
  })

  it('LOSING the close race is answered, not thrown', async () => {
    // Another close claimed the row first: the .eq('status','pending') on the update returns
    // nothing, and this must not tally twice or draft twice.
    state.pollRow = WITH_DRAFTS
    state.votesSelect = { data: [{ option_key: 'early' }], error: null }
    state.updateRes = { data: null, error: null }
    const r = await closePoll('p1')
    expect(r).toEqual({ ok: false, reason: 'already_closed' })
    expect(vi.mocked(createDecision)).not.toHaveBeenCalled()
  })

  it('THE TYPE FORBIDS IT — PollDraftSpec has no status and no amount_cents field', () => {
    const src = strip(read('src/lib/team/polls.ts'))
    const at = src.indexOf('export interface PollDraftSpec')
    expect(at, 'PollDraftSpec is gone').toBeGreaterThan(-1)
    const body = src.slice(at, src.indexOf('}', at))
    expect(body).not.toMatch(/status/)
    expect(body).not.toMatch(/amount_cents/)
    // and the close path never passes either
    const closeAt = src.indexOf('const drafted: string[] = []')
    expect(closeAt).toBeGreaterThan(-1)
    const closeBody = src.slice(closeAt)
    expect(closeBody).not.toMatch(/status:/)
    expect(closeBody).not.toMatch(/amount_cents:/)
  })
})
