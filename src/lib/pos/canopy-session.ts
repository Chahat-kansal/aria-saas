import { createHmac } from 'crypto'

// SHELL-1 — session token for the Canopy desktop shell's PIN lock. Same signed-HMAC shape as
// src/lib/pos/manager-token.ts (deliberately not reused directly — that one is scoped to a 60-second
// manager override, this one to a persistent shift-length Canopy session; different security
// properties, same primitive). 16 hours covers a full trading day plus close-out without forcing a
// re-lock mid-shift; the Shelf's own "Lock" control (not expiry) is the normal way this ends.
const SECRET = process.env.MANAGER_TOKEN_SECRET ?? process.env.CRON_SECRET ?? 'aria-manager-fallback'
const SESSION_TTL_MS = 16 * 60 * 60 * 1000

export type CanopyScope = 'owner' | 'staff'

export function signCanopySessionToken(businessId: string, staffId: string, scope: CanopyScope): string {
  const expiresAt = Date.now() + SESSION_TTL_MS
  const payload = `${businessId}:${staffId}:${scope}:${expiresAt}`
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export interface CanopySession {
  businessId: string
  staffId: string
  scope: CanopyScope
}

export function verifyCanopySessionToken(token: string): CanopySession | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const [businessId, staffId, scope, expiresAtStr, sig] = decoded.split(':')
    if (!businessId || !staffId || !scope || !expiresAtStr || !sig) return null
    if (scope !== 'owner' && scope !== 'staff') return null
    const payload = `${businessId}:${staffId}:${scope}:${expiresAtStr}`
    const expected = createHmac('sha256', SECRET).update(payload).digest('hex')
    if (sig !== expected) return null
    if (Date.now() > parseInt(expiresAtStr, 10)) return null
    return { businessId, staffId, scope }
  } catch {
    return null
  }
}
