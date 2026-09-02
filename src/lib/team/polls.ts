import { supabaseAdmin } from '@/lib/supabase-admin'
import { createDecision } from '@/lib/decisions/createDecision'
import { recordEvent } from '@/lib/moat/recordEvent'

/**
 * TS-1 PHASE 3 — THE POLL ENGINE.
 *
 * A poll is not a new entity. It is an `aria_autopilot_actions` row with `kind='team_poll'`, its
 * options in `action_data`, and its close time in `expires_at`. That is deliberate: it means a poll
 * inherits the decision spine for free — the owner queue, the expiry sweep from phase 2, and
 * `business_events` — instead of growing a parallel lifecycle nobody maintains.
 *
 * ── NO NEW ROUTE, DELIBERATELY ─────────────────────────────────────────────────────────────────
 * This ships as a library, not an endpoint. TS-2 defines a three-route budget
 * (/api/team/feed, /api/team/act, /api/team/message) and act is where create/vote/close will be
 * dispatched from. Adding routes here would spend that budget twice and then need deleting.
 * Function count is unchanged at 9/22.
 *
 * ── UNIQUENESS COMES FROM THE DATABASE. FULL STOP. ─────────────────────────────────────────────
 * `team_poll_votes` carries UNIQUE (poll_id, staff_member_id). `castVote` does a plain INSERT and
 * treats 23505 as an EXPECTED outcome. There is no "have they voted yet?" SELECT anywhere in this
 * file, because that check is a race by construction: two requests both read "no vote", both
 * insert, and the only thing that saves you is the constraint you were trying to pre-empt.
 */

/** Postgres unique_violation. The one error code this module treats as a normal answer. */
const PG_UNIQUE_VIOLATION = '23505'

export type PollDomain = 'money' | 'people' | 'growth' | 'supply' | 'compliance'

/** What the poll is about. Drives `domain`, which is CHECK-constrained on the table. */
export type PollSubject = 'roster' | 'menu' | 'price' | 'supplier' | 'other'

export interface PollOption {
  /** Stable key stored on the vote row. Never the label — labels get edited. */
  key: string
  label: string
  /**
   * TS-1 PHASE 4 — what this option would PROPOSE if it won. Optional: a poll that only asks a
   * question ("early or late start?") carries none, and closing it drafts nothing.
   */
  drafts?: PollDraftSpec[]
}

/**
 * A draft the winning option proposes. Deliberately NARROW: there is no `status` here, so no
 * caller can ask for a draft that is already approved or executed, and no `amount_cents` —
 * a poll cannot commit money. Both omissions are the point, not an oversight.
 */
export interface PollDraftSpec {
  /** Machine key for the decision type, e.g. 'roster_publish'. */
  kind: string
  title: string
  subtitle?: string | null
  /** Optional override; defaults to the poll's own domain. */
  domain?: PollDomain
  payload?: Record<string, unknown>
}

/**
 * Subject → domain, per the standing ruling. Defaults to 'people' because a team poll is about
 * the team unless it is plainly about something else.
 */
export function domainForSubject(subject: PollSubject | undefined): PollDomain {
  switch (subject) {
    case 'menu':
    case 'price':    return 'money'
    case 'supplier': return 'supply'
    case 'roster':
    case 'other':
    default:         return 'people'
  }
}

/**
 * Priority per the standing ruling: 'routine' unless the domain is money.
 *
 * JUDGEMENT CALL, recorded: the ruling says what money is NOT ('routine') but not what it IS.
 * 'important' is chosen over 'urgent' because a poll is by definition not urgent — it has a
 * closing time and waits for people. Both are inside the CHECK; no new value invented.
 */
export function priorityForDomain(domain: PollDomain): 'important' | 'routine' {
  return domain === 'money' ? 'important' : 'routine'
}

export interface CreatePollParams {
  business_id: string
  title: string
  options: PollOption[]
  /** When voting closes. Also what the phase-2 expiry sweep will act on if nobody closes it. */
  closes_at: string
  subject?: PollSubject
  question?: string | null
  outlet_id?: string | null
  /** Who opened it. A staff-opened poll is why the actor unions widened this sprint. */
  actor?: 'aria' | 'owner' | 'staff'
}

/**
 * Open a poll. Goes through `createDecision` — the existing propose path — so the row, the
 * 'proposed' business_event and the owner notification all happen exactly as they do for every
 * other decision. Nothing about the poll's creation is special-cased.
 */
export async function createPoll(params: CreatePollParams): Promise<string | null> {
  const { business_id, title, options, closes_at, subject, question, outlet_id, actor = 'staff' } = params

  // A poll with fewer than two options is not a poll. Refuse rather than create something that
  // cannot be voted on — a fake control is worse than no control.
  if (options.length < 2) {
    console.error('[polls] refused: a poll needs at least two options, got', options.length)
    return null
  }
  const keys = new Set(options.map(o => o.key))
  if (keys.size !== options.length) {
    console.error('[polls] refused: duplicate option keys')
    return null
  }

  const domain = domainForSubject(subject)
  return createDecision({
    business_id,
    domain,
    kind: 'team_poll',
    title,
    subtitle: question ?? null,
    priority: priorityForDomain(domain),
    expires_at: closes_at,
    outlet_id: outlet_id ?? null,
    payload: {
      poll: true,
      subject: subject ?? 'other',
      question: question ?? null,
      options: options.map(o => ({ key: o.key, label: o.label })),
    },
    actor,
  })
}

export type VoteResult =
  | { ok: true; option_key: string }
  /** The staff member already voted. EXPECTED, not an error — the DB arbitrated and said so. */
  | { ok: false; reason: 'already_voted' }
  | { ok: false; reason: 'poll_closed' }
  | { ok: false; reason: 'poll_not_found' }
  | { ok: false; reason: 'unknown_option' }
  | { ok: false; reason: 'error'; message: string }

/** Only the columns needed. `select *` is never used — see the staff_members rule. */
const POLL_COLUMNS = 'id, business_id, kind, status, expires_at, action_data'
/** Same list plus `domain`, as a LITERAL: concatenating the select string defeats
 *  supabase-js's return-type inference and forces an unsafe cast. */
const POLL_COLUMNS_WITH_DOMAIN = 'id, business_id, kind, status, expires_at, action_data, domain'

interface PollRow {
  id: string
  business_id: string
  kind: string | null
  status: string | null
  expires_at: string | null
  action_data: { options?: Array<{ key?: string; drafts?: PollDraftSpec[] }> } | null
}

/**
 * Cast one vote.
 *
 * The option and open/closed checks below are ordinary validation — they answer "is this a
 * sensible request", and getting them slightly stale is harmless. Uniqueness is NOT validated
 * here, because it is the one property where a stale read is a duplicate row.
 */
export async function castVote(
  pollId: string,
  staffMemberId: string,
  optionKey: string,
): Promise<VoteResult> {
  const { data, error } = await supabaseAdmin
    .from('aria_autopilot_actions')
    .select(POLL_COLUMNS)
    .eq('id', pollId)
    .eq('kind', 'team_poll')
    .maybeSingle()

  // RULE 7 — the error is checked, never collapsed into "not found".
  if (error) return { ok: false, reason: 'error', message: error.message }
  if (!data) return { ok: false, reason: 'poll_not_found' }

  const poll = data as PollRow
  if (poll.status !== 'pending') return { ok: false, reason: 'poll_closed' }
  if (poll.expires_at && new Date(poll.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: 'poll_closed' }
  }
  const known = (poll.action_data?.options ?? []).map(o => o?.key)
  if (!known.includes(optionKey)) return { ok: false, reason: 'unknown_option' }

  // THE INSERT. No preceding "already voted?" SELECT — the unique index is the arbiter.
  const { error: voteErr } = await supabaseAdmin
    .from('team_poll_votes')
    .insert({
      business_id: poll.business_id,
      poll_id: pollId,
      staff_member_id: staffMemberId,
      option_key: optionKey,
    })

  if (voteErr) {
    // A second vote is a normal thing for a person to attempt. It is answered, not thrown:
    // surfacing 23505 as a 500 would tell the voter the product is broken when it is working.
    if ((voteErr as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      return { ok: false, reason: 'already_voted' }
    }
    return { ok: false, reason: 'error', message: voteErr.message }
  }
  return { ok: true, option_key: optionKey }
}

export interface Tally {
  option_key: string
  votes: number
}

export type CloseResult =
  | { ok: true; outcome: 'winner'; winner: string; tally: Tally[]; drafted: string[] }
  /** Nobody voted, or the top two tied. Neither invents a winner. */
  | { ok: true; outcome: 'no_votes' | 'tie'; tied?: string[]; tally: Tally[] }
  | { ok: false; reason: 'poll_not_found' | 'already_closed' }
  | { ok: false; reason: 'error'; message: string }

/**
 * Close a poll and tally it.
 *
 * ── STATUS CHOICE, AND IT IS A JUDGEMENT CALL ──────────────────────────────────────────────────
 * The status CHECK cannot be extended (standing ruling), so a closed poll must land on one of the
 * existing values. It is set to 'executed': in this table 'executed' means "this already happened,
 * nothing is waiting on anyone", which is exactly true of a poll that has run and been tallied.
 * 'approved' was rejected because in this table that means an OWNER approved something, and no
 * owner has — the drafts a close produces (phase 4) are what the owner approves.
 *
 * A no-votes or tied poll closes as 'dismissed': it produced no decision, and marking it
 * 'executed' would imply an outcome it does not have. NO WINNER IS EVER INVENTED to break a tie.
 *
 * Either way the poll leaves 'pending', so the phase-2 expiry sweep cannot touch it afterwards.
 */
export async function closePoll(pollId: string, closedBy?: string | null): Promise<CloseResult> {
  const { data, error } = await supabaseAdmin
    .from('aria_autopilot_actions')
    .select(POLL_COLUMNS_WITH_DOMAIN)
    .eq('id', pollId)
    .eq('kind', 'team_poll')
    .maybeSingle()

  if (error) return { ok: false, reason: 'error', message: error.message }
  if (!data) return { ok: false, reason: 'poll_not_found' }
  const poll = data as PollRow & { domain: string | null }
  if (poll.status !== 'pending') return { ok: false, reason: 'already_closed' }

  const { data: votes, error: votesErr } = await supabaseAdmin
    .from('team_poll_votes')
    .select('option_key')
    .eq('poll_id', pollId)

  if (votesErr) return { ok: false, reason: 'error', message: votesErr.message }

  const counts = new Map<string, number>()
  for (const o of poll.action_data?.options ?? []) if (o?.key) counts.set(o.key, 0)
  for (const v of (votes ?? []) as Array<{ option_key: string }>) {
    counts.set(v.option_key, (counts.get(v.option_key) ?? 0) + 1)
  }
  const tally: Tally[] = [...counts.entries()]
    .map(([option_key, n]) => ({ option_key, votes: n }))
    .sort((a, b) => b.votes - a.votes || a.option_key.localeCompare(b.option_key))

  const total = tally.reduce((s, t) => s + t.votes, 0)
  const top = tally[0]
  const tied = tally.filter(t => top && t.votes === top.votes).map(t => t.option_key)

  let outcome: 'winner' | 'no_votes' | 'tie'
  if (total === 0) outcome = 'no_votes'
  else if (tied.length > 1) outcome = 'tie'
  else outcome = 'winner'

  const note = outcome === 'winner'
    ? `Poll closed. Winner: ${top!.option_key} with ${top!.votes} of ${total} vote(s).`
    : outcome === 'tie'
      ? `Poll closed with no winner: ${tied.join(' and ')} tied on ${top!.votes} vote(s) each.`
      : 'Poll closed with no votes cast.'

  // The same atomic-claim shape phase 2 uses: the status re-check rides the UPDATE, so two
  // simultaneous closes cannot both tally and both draft.
  const { data: closed, error: closeErr } = await supabaseAdmin
    .from('aria_autopilot_actions')
    .update({
      status: outcome === 'winner' ? 'executed' : 'dismissed',
      outcome_note: note,
      resolved_at: new Date().toISOString(),
      ...(closedBy ? { resolved_by: closedBy } : {}),
      action_data: { ...(poll.action_data ?? {}), tally, closed_outcome: outcome },
    })
    .eq('id', pollId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (closeErr) return { ok: false, reason: 'error', message: closeErr.message }
  if (!closed) return { ok: false, reason: 'already_closed' }   // someone else won the close race

  await recordEvent({
    business_id: poll.business_id,
    entity_type: 'decision',           // standing ruling: a poll IS a decision row
    entity_id: pollId,
    event_type: outcome === 'winner' ? 'approved' : 'declined',
    domain: poll.domain,
    amount_cents: null,                // a poll spends nothing. Never 0 as a stand-in for unknown.
    actor: closedBy ? 'staff' : 'cron',
    payload_summary: { kind: 'team_poll', domain: poll.domain, decided_vs_proposed: false },
  })

  // ── TS-1 PHASE 4 — EXECUTION BINDING ─────────────────────────────────────────────────────────
  // The winning option DRAFTS through createDecision, the same propose path every other decision
  // uses. Each draft lands 'pending' and waits for a human.
  //
  // WHAT THIS DELIBERATELY DOES NOT DO, and each omission is load-bearing:
  //   · it never passes `status`, so createDecision's 'pending' default stands. A poll cannot
  //     produce an approved or executed row.
  //   · PollDraftSpec has no amount_cents field at all, so a poll cannot commit money. Not
  //     "validated to zero" — absent from the type, so it cannot be expressed.
  //   · it never calls an executor. Winning a vote proposes; it does not do.
  // A tie or a no-vote close drafts NOTHING: there is no winner, so there is nothing to propose.
  const drafted: string[] = []
  if (outcome === 'winner') {
    const winningOption = (poll.action_data?.options ?? [])
      .find(o => o?.key === top!.option_key) as (PollOption | undefined)
    for (const spec of winningOption?.drafts ?? []) {
      const id = await createDecision({
        business_id: poll.business_id,
        domain: spec.domain ?? ((poll.domain ?? 'people') as PollDomain),
        kind: spec.kind,
        title: spec.title,
        subtitle: spec.subtitle ?? null,
        payload: { ...(spec.payload ?? {}), from_poll: pollId, winning_option: top!.option_key },
        aria_reason: `The team chose "${top!.option_key}" (${top!.votes} of ${total} votes).`,
        actor: 'staff',
        // NO status. NO amount_cents. See the note above — both are omissions by design.
      })
      if (id) drafted.push(id)
      else console.error('[polls] draft failed for kind', spec.kind, 'on poll', pollId)
    }
  }

  return outcome === 'winner'
    ? { ok: true, outcome, winner: top!.option_key, tally, drafted }
    : { ok: true, outcome, ...(outcome === 'tie' ? { tied } : {}), tally }
}
