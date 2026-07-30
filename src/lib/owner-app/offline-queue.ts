// OWNER-APP PH-5 Part A — the offline write queue for owner decisions.
//
// Mirrors the PROVEN pattern in src/lib/inventory/offline-queue.ts (INV-OFFLINE): a tiny IndexedDB
// queue (survives reload, unlike localStorage), replayed on reconnect through the SAME canonical
// endpoint so server validation, RLS, the ACCESS-MODEL-1 capability gate and idempotency all still
// apply. Deliberately a separate store from the inventory queue — different surface, different
// endpoint, no shared failure mode — but the same discipline.
//
// ★ HARD EXCLUSION: MONEY NEVER QUEUES ★
// A money/step-up decision cannot be completed offline, for two independent reasons: step-up
// verification requires the server (it is a real re-auth, not a local flag), and approving money
// against a stale offline snapshot is unsafe — the amount or the decision may have changed. The UI
// shows "needs connection to approve" and the action is refused, not deferred. enqueueDecision()
// REFUSES such a decision rather than accepting it and failing later.
//
// ★ CONFLICT: THE QUEUED ACTION LOSES GRACEFULLY ★
// PH-1's endpoint already re-checks status='pending' atomically and returns 409 `not_waiting` if
// the decision moved on. On flush, a 409 is treated as a SUCCESSFUL RESOLUTION of the queue entry
// (it is removed) and reported to the owner as "already handled" — never retried, never forced.
// There is no last-write-wins path.

export interface QueuedDecisionAction {
  id?: number
  business_id: string
  decision_id: string
  decision_title: string
  action: 'approve' | 'decline'
  client_ts: number
}

export interface FlushResult {
  sent: number
  already_handled: number
  failed: number
}

const DB_NAME = 'aria-owner-offline'
const STORE = 'decision_actions'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

/**
 * Queue an offline decision action. Returns false when it CANNOT be queued — the caller must then
 * block and tell the owner, never silently drop.
 *
 * `requiresConnection` is the money/step-up test: those are refused outright.
 */
export async function enqueueDecisionAction(
  entry: Omit<QueuedDecisionAction, 'id' | 'client_ts'>,
  requiresConnection: boolean,
): Promise<boolean> {
  if (requiresConnection) return false // money/step-up: refused offline, by design
  const db = await openDb()
  if (!db) return false                // no IndexedDB → caller blocks; never a silent loss
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).add({ ...entry, client_ts: Date.now() })
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
  })
}

export async function pendingActions(): Promise<QueuedDecisionAction[]> {
  const db = await openDb()
  if (!db) return []
  return new Promise(resolve => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    req.onsuccess = () => resolve((req.result ?? []) as QueuedDecisionAction[])
    req.onerror = () => resolve([])
  })
}

async function remove(id: number): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

/**
 * Replay every queued action through the real endpoint. Idempotency is inherited, not
 * reimplemented: the server's atomic `.eq('status','pending')` guard means a replayed approve for
 * an already-approved decision cannot double-apply — it returns 409 and we resolve the entry.
 */
export async function flushQueue(): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, already_handled: 0, failed: 0 }
  for (const entry of await pendingActions()) {
    try {
      const res = await fetch('/api/owner/decisions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: entry.business_id, id: entry.decision_id, action: entry.action,
        }),
      })
      if (res.ok) {
        result.sent++
        if (entry.id != null) await remove(entry.id)
      } else if (res.status === 409) {
        // Resolved server-side while we were offline (someone else handled it, or it expired).
        // The queued action LOSES — correct, and not an error worth retrying.
        result.already_handled++
        if (entry.id != null) await remove(entry.id)
      } else if (res.status === 403) {
        // Out of role (ACCESS-MODEL-1 capability gate). Never retry — it will never succeed.
        result.failed++
        if (entry.id != null) await remove(entry.id)
      } else {
        result.failed++ // transient — keep it queued for the next reconnect
      }
    } catch {
      result.failed++   // still offline; leave it queued
    }
  }
  return result
}
