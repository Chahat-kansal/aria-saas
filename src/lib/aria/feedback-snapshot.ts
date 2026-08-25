/**
 * S1 PHASE 5 — FEEDBACK. THE UI IS PARKED; THIS IS THE PART THAT CAN EXIST TODAY.
 *
 * ── WHY NO THUMBS BUTTON SHIPPED ───────────────────────────────────────────────────────────────
 * There is no feedback table. I checked every table matching feedback/rating/thumb/eval in the live
 * database: none. The decision table says park it and name the schema, and MS17's rail says a
 * control that cannot do anything must not be on screen. A thumbs-down that silently drops the
 * rating is worse than no thumbs-down: the owner believes they have told us something.
 *
 * ── WHY A SNAPSHOT, NOT A MESSAGE ID ───────────────────────────────────────────────────────────
 * A feedback row holding only `message_id` is a dead table. Messages here are JSONB entries that get
 * SUPERSEDED by regenerate and edit-and-rerun (see conversation-branch.ts), so the row a rating
 * points at may no longer be what the owner rated — or may not render at all. Worse, the reason the
 * answer was wrong usually lives in the GROUND TRUTH it was built from, which is not in the message
 * at all.
 *
 * So a rating captures everything needed to reproduce the failure without the conversation:
 * the question, the exact answer text, the model and provider that produced it, and the provenance
 * anchors that were in play. That is also precisely the shape of an EvalCase, which is how a
 * thumbs-down becomes a regression test instead of a statistic.
 *
 * ── THE SCHEMA THIS NEEDS (NOT APPLIED — DDL IS THE FOUNDER'S) ─────────────────────────────────
 *
 *   create table public.aria_message_feedback (
 *     id               uuid primary key default gen_random_uuid(),
 *     business_id      uuid not null references public.businesses(id),
 *     user_id          uuid,
 *     conversation_id  uuid references public.aria_conversations(id),
 *     message_id       text,            -- the JSONB message id, for context only. NOT the record.
 *     rating           text not null check (rating in ('up','down')),
 *     reason           text,            -- optional, the owner's words
 *     question         text not null,   -- SNAPSHOT: what was asked
 *     answer           text not null,   -- SNAPSHOT: exactly what was said, at rating time
 *     model            text,            -- SNAPSHOT: which model produced it
 *     provider         text,            -- SNAPSHOT: anthropic | google | openai
 *     provenance       jsonb not null default '{}'::jsonb,  -- anchors + tiers in play
 *     answer_incomplete boolean not null default false,      -- was it a stopped partial?
 *     created_at       timestamptz not null default now()
 *   );
 *   create index aria_message_feedback_biz_idx on public.aria_message_feedback (business_id, created_at desc);
 *   create index aria_message_feedback_down_idx on public.aria_message_feedback (business_id) where rating = 'down';
 *   -- RLS: owner reads/writes only their own business's rows, same policy shape as aria_conversations.
 */

export type Rating = 'up' | 'down'

export interface FeedbackSnapshot {
  rating: Rating
  reason?: string
  /** What the owner asked. */
  question: string
  /** Exactly what Aria said, as it stood when rated. */
  answer: string
  model: string | null
  provider: string | null
  /** The provenance in play: which figures were verified, estimated, or unbacked. */
  provenance: { anchors: number[]; tiers: Record<string, number> }
  /** Was the rated answer a stopped partial? A 👎 on a partial means something different. */
  answerIncomplete: boolean
  /** Context only. Never the record — messages get superseded. */
  messageId: string | null
  conversationId: string | null
}

export interface SnapshotInput {
  rating: Rating
  reason?: string
  question: string
  answer: string
  model?: string | null
  provider?: string | null
  anchors?: number[]
  /** Figure tiers as rendered, e.g. { verified: 3, estimated: 1, plain: 2 }. */
  tiers?: Record<string, number>
  answerIncomplete?: boolean
  messageId?: string | null
  conversationId?: string | null
}

/**
 * Build the record. Everything is copied BY VALUE at rating time, so a later edit or regenerate
 * cannot change what the feedback says was rated.
 */
export function buildFeedbackSnapshot(input: SnapshotInput): FeedbackSnapshot {
  return {
    rating: input.rating,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    question: String(input.question ?? ''),
    answer: String(input.answer ?? ''),
    model: input.model ?? null,
    provider: input.provider ?? null,
    provenance: {
      anchors: [...(input.anchors ?? [])],
      tiers: { ...(input.tiers ?? {}) },
    },
    answerIncomplete: Boolean(input.answerIncomplete),
    messageId: input.messageId ?? null,
    conversationId: input.conversationId ?? null,
  }
}

/** Can this record reproduce the failure on its own, with no conversation to look up? */
export function isReproducible(s: FeedbackSnapshot): boolean {
  return s.question.trim().length > 0 && s.answer.trim().length > 0
}

/**
 * HOW A 👎 FEEDS THE EVAL SET.
 *
 * The 51-case set in lib/aria/evals/cases.ts is `{ id, category, question, ground, good, bad,
 * expectBad }`. A thumbs-down already carries the question, the bad answer and the ground truth it
 * was built from — so it converts directly into a candidate case. The one field a human must still
 * supply is `good`: what Aria SHOULD have said. That is judgement, and it is the right place to
 * require a person.
 *
 * `expectBad` defaults to 'refuse' when the answer carried unbacked figures (the model asserted
 * numbers it could not support) and 'hedge' otherwise.
 */
export function toEvalCaseDraft(s: FeedbackSnapshot): {
  id: string; question: string; bad: string; expectBad: 'refuse' | 'hedge'
  ground: { anchors: number[] }; needsHuman: 'good'
} {
  const unbacked = (s.provenance.tiers.plain ?? 0) > 0
  return {
    id: 'fb:' + (s.messageId ?? s.question.slice(0, 24)),
    question: s.question,
    bad: s.answer,
    expectBad: unbacked ? 'refuse' : 'hedge',
    ground: { anchors: s.provenance.anchors },
    needsHuman: 'good',
  }
}
