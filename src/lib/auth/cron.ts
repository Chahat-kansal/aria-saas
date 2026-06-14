import { NextResponse } from 'next/server'

/**
 * Verifies that an incoming `/api/cron/*` request is an authentic scheduled
 * invocation by checking the `Authorization: Bearer <CRON_SECRET>` header.
 *
 * Vercel automatically attaches this header to scheduled cron requests when the
 * `CRON_SECRET` environment variable is configured (and the matching
 * `headers` block is set on each cron entry in `vercel.json`). Any request that
 * does not present the exact secret is rejected with 401 — this is the only
 * trusted signal. The previously-relied-upon "vercel-cron" User-Agent is
 * trivially spoofable and must never be used for authorization.
 *
 * Usage in a route handler:
 *   const denied = verifyCronAuth(req)
 *   if (denied) return denied
 *
 * @returns a 401 `NextResponse` when authorization fails, or `null` when the
 *          request is authorised and the handler should proceed.
 */
export function verifyCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization') ?? ''
  // Fail closed: if the secret is unset, or the header is missing/wrong, reject.
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
