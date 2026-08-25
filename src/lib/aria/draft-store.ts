/**
 * S2 PHASE 5 — DRAFT PERSISTENCE.
 *
 * A half-typed thought that vanishes because the owner clicked a thread and came back is a small
 * betrayal that makes a product feel careless.
 *
 * ── WHY LOCAL, NOT THE DATABASE ────────────────────────────────────────────────────────────────
 * The sprint says local to the device is fine and preferable, and it is right: a half-typed message
 * is not a business record. It has no audit value, nobody else should ever read it, and round-
 * tripping every keystroke to Postgres would cost a write per character for something that is
 * usually discarded. It also means an unsent thought never leaves the owner's machine.
 *
 * Keyed per thread, so a draft in one conversation cannot surface in another. The key for a
 * not-yet-created thread is 'new', which is why a draft typed before the first send survives too.
 */

const PREFIX = 'aria:draft:'
const MAX_DRAFT = 20_000

function keyFor(conversationId: string | null): string {
  return PREFIX + (conversationId ?? 'new')
}

/** Read a thread's draft. Returns '' for anything unreadable — a draft is never worth an exception. */
export function readDraft(conversationId: string | null): string {
  try {
    return localStorage.getItem(keyFor(conversationId)) ?? ''
  } catch {
    // private mode, disabled storage, quota — the composer still works, it just does not remember
    return ''
  }
}

/** Save (or clear, when empty) a thread's draft. */
export function writeDraft(conversationId: string | null, text: string): void {
  try {
    const t = String(text ?? '')
    if (!t.trim()) { localStorage.removeItem(keyFor(conversationId)); return }
    localStorage.setItem(keyFor(conversationId), t.slice(0, MAX_DRAFT))
  } catch { /* storage is a convenience here, never a requirement */ }
}

export function clearDraft(conversationId: string | null): void {
  try { localStorage.removeItem(keyFor(conversationId)) } catch { /* as above */ }
}

/**
 * A draft typed before the thread existed belongs to the thread that came out of it.
 * Without this, the first message of every conversation would lose its draft the moment the
 * server assigned an id.
 */
export function adoptDraft(newConversationId: string): void {
  try {
    const pending = localStorage.getItem(keyFor(null))
    if (pending && !localStorage.getItem(keyFor(newConversationId))) {
      localStorage.setItem(keyFor(newConversationId), pending)
    }
    localStorage.removeItem(keyFor(null))
  } catch { /* as above */ }
}

/** Every draft key currently held, for tests and for a future "clear my data" action. */
export function draftKeys(): string[] {
  try {
    const out: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) out.push(k)
    }
    return out
  } catch { return [] }
}
