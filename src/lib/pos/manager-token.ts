import { createHmac } from 'crypto'

// SEC-MANAGER-1 — an auth secret must never have a default. The previous fallback literal meant a
// misconfigured environment (new preview deploy, unset var) silently downgraded manager override
// tokens to a key published in this repo — anyone reading the source could mint tokens for voids,
// refunds and discounts. Resolved LAZILY so a missing var fails the request, not the build: SECRET
// was a top-level const, so throwing at module scope would break import for every route below.
function getSecret(): string {
  const s = process.env.MANAGER_TOKEN_SECRET ?? process.env.CRON_SECRET
  if (!s) throw new Error('MANAGER_TOKEN_SECRET (or CRON_SECRET) is not set')
  return s
}

export function signManagerToken(staffId: string): string {
  const expiresAt = Date.now() + 60_000  // 60s
  const payload = `${staffId}:${expiresAt}`
  const sig = createHmac('sha256', getSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export function verifyManagerToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const [staffId, expiresAtStr, sig] = decoded.split(':')
    if (!staffId || !expiresAtStr || !sig) return null
    const payload = `${staffId}:${expiresAtStr}`
    const expected = createHmac('sha256', getSecret()).update(payload).digest('hex')
    if (sig !== expected) return null
    if (Date.now() > parseInt(expiresAtStr)) return null
    return staffId
  } catch { return null }
}