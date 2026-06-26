// INV-OFFLINE — a tiny IndexedDB queue for offline inventory WRITES (survives reload, unlike localStorage).
// Only SAFE, low-conflict writes are queued (waste / temp / count — count is already variance→owner-review, so a
// delayed count is correct). On reconnect the page replays each entry through the SAME canonical API endpoint
// (so server validation, attribution via the staff cookie, and gating still apply). Money/stock-moving writes are
// NOT queued — they're blocked offline by the page. Best-effort: if IndexedDB is unavailable, enqueue returns false
// and the caller blocks instead (never a silent drop).

export interface QueuedWrite {
  id?: number
  endpoint: string
  method: string
  payload: unknown
  label: string        // human-readable, for the pending indicator
  client_ts: number    // when the staffer made the change (for ordering / display)
  status: 'pending' | 'failed'
  error?: string
}

const DB_NAME = 'aria-inv-offline'
const STORE = 'writes'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Queue a write. Returns false if it could not be persisted (caller must then block, never silently drop). */
export async function enqueueWrite(w: Omit<QueuedWrite, 'id' | 'status'>): Promise<boolean> {
  try {
    const db = await openDb()
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).add({ ...w, status: 'pending' })
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    })
  } catch { return false }
}

export async function allWrites(): Promise<QueuedWrite[]> {
  try {
    const db = await openDb()
    return await new Promise<QueuedWrite[]>((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const r = tx.objectStore(STORE).getAll()
      r.onsuccess = () => resolve((r.result as QueuedWrite[]) ?? [])
      r.onerror = () => resolve([])
    })
  } catch { return [] }
}

export async function removeWrite(id: number): Promise<void> {
  try { const db = await openDb(); await new Promise<void>((resolve) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => resolve() }) } catch { /* ignore */ }
}

export async function markFailed(id: number, error: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE)
      const g = store.get(id)
      g.onsuccess = () => { const row = g.result as QueuedWrite | undefined; if (row) { row.status = 'failed'; row.error = error; store.put(row) } }
      tx.oncomplete = () => resolve(); tx.onerror = () => resolve()
    })
  } catch { /* ignore */ }
}

export async function pendingCount(): Promise<number> { return (await allWrites()).filter(w => w.status === 'pending').length }
export async function failedCount(): Promise<number> { return (await allWrites()).filter(w => w.status === 'failed').length }
