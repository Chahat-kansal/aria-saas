/**
 * S1 PHASES 2 & 3 — SUPERSEDE, NEVER DELETE.
 *
 * Regenerating an answer and editing an earlier question both replace part of a thread. Neither may
 * destroy what was there before: an owner who regenerates and prefers the first answer has lost it,
 * and a support question about "what did Aria tell me on Tuesday" needs the original to still exist.
 *
 * There is no messages table — `aria_conversations.messages` is a JSONB array — so a branch is
 * modelled INSIDE the message objects:
 *
 *   superseded_at : when this message stopped being part of the live thread
 *   superseded_by : the id of the message that replaced it (a parent pointer, in reverse)
 *   branch_root   : the id of the message the new branch grew from
 *
 * Nothing is spliced out of the array. `renderPath()` filters to what the owner should see, and the
 * superseded rows stay in the database for good.
 *
 * DELIBERATELY NOT BUILT: any branch-navigation UI. A café owner will never sit and compare three
 * generations side by side; they want the newest one to be right. The old branch is for the
 * database and for support, not for the screen.
 */

export interface ThreadMessage {
  role: string
  content: string
  ts?: string
  id?: string
  incomplete?: boolean
  stopped_by?: string
  superseded_at?: string
  superseded_by?: string
  branch_root?: string
  edited_from?: string
  /**
   * S3 PHASE 1 — the ground truth this assistant turn was checked against, stored WITH the turn.
   * Absent (not empty) when the turn computed no anchors, so "never captured" stays distinct from
   * "captured nothing".
   */
  provenance?: { anchors: number[]; anchorLabels?: Record<string, string> }
  [k: string]: unknown
}

/** A stable id for a message that predates ids, derived from its position and timestamp. */
export function messageId(m: ThreadMessage, index: number): string {
  return String(m.id ?? `${index}:${m.ts ?? ''}`)
}

/** Is this message part of the thread the owner should see? */
export function isLive(m: ThreadMessage): boolean {
  return !m.superseded_at
}

/** The messages that render: everything not superseded, in order. */
export function renderPath(messages: ThreadMessage[] | null | undefined): ThreadMessage[] {
  return (messages ?? []).filter(isLive)
}

/** Index of the last LIVE assistant message, or -1. */
export function lastLiveAssistantIndex(messages: ThreadMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === 'assistant' && isLive(m)) return i
  }
  return -1
}

/**
 * PHASE 2 — regenerate. Marks the last live assistant turn superseded and returns the new array.
 *
 * The old row STAYS in the array. Length never shrinks; it only ever grows.
 */
export function supersedeLastAssistant(
  messages: ThreadMessage[],
  replacementId: string,
  now: string = new Date().toISOString(),
): { messages: ThreadMessage[]; supersededIndex: number } {
  const idx = lastLiveAssistantIndex(messages)
  if (idx === -1) return { messages, supersededIndex: -1 }

  const next = messages.map((m, i) =>
    i === idx ? { ...m, superseded_at: now, superseded_by: replacementId } : m,
  )
  return { messages: next, supersededIndex: idx }
}

/**
 * PHASE 3 — edit and re-run. Marks the edited message AND everything after it superseded, then the
 * caller appends the edited question and its new answer.
 *
 * Everything downstream is superseded rather than removed, because an answer that was given is a
 * fact about what happened, whatever the question was later changed to.
 */
export function supersedeFrom(
  messages: ThreadMessage[],
  fromIndex: number,
  replacementId: string,
  now: string = new Date().toISOString(),
): { messages: ThreadMessage[]; supersededCount: number } {
  if (fromIndex < 0 || fromIndex >= messages.length) {
    return { messages, supersededCount: 0 }
  }
  let count = 0
  const next = messages.map((m, i) => {
    if (i < fromIndex || !isLive(m)) return m
    count++
    return { ...m, superseded_at: now, superseded_by: replacementId }
  })
  return { messages: next, supersededCount: count }
}

/** The index of the Nth live message — the client counts what it can see, the server stores all. */
export function liveIndexToAbsolute(messages: ThreadMessage[], liveIndex: number): number {
  let seen = -1
  for (let i = 0; i < messages.length; i++) {
    if (isLive(messages[i]!)) {
      seen++
      if (seen === liveIndex) return i
    }
  }
  return -1
}
