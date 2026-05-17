import { createHmac } from 'crypto'

const SECRET = process.env.MANAGER_TOKEN_SECRET ?? process.env.CRON_SECRET ?? 'aria-manager-fallback'

export function signManagerToken(staffId: string): string {
  const expiresAt = Date.now() + 60_000  // 60s
  const payload = `${staffId}:${expiresAt}`
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export function verifyManagerToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const [staffId, expiresAtStr, sig] = decoded.split(':')
    if (!staffId || !expiresAtStr || !sig) return null
    const payload = `${staffId}:${expiresAtStr}`
    const expected = createHmac('sha256', SECRET).update(payload).digest('hex')
    if (sig !== expected) return null
    if (Date.now() > parseInt(expiresAtStr)) return null
    return staffId
  } catch { return null }
}