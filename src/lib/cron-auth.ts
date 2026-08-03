/**
 * @deprecated DO NOT IMPORT. Use `verifyCronAuth` from '@/lib/auth/cron' instead.
 *
 * DANGER - this module's `verifyCronAuth` returns a BOOLEAN (true = authorised).
 * The canonical one in '@/lib/auth/cron' returns `Response | null` (non-null = DENIED) and every
 * cron route uses the pattern `const denied = verifyCronAuth(req); if (denied) return denied`.
 *
 * Importing THIS one with that pattern inverts authentication exactly backwards: a valid cron call
 * returns early, an unauthenticated one falls through and runs the job.
 *
 * Kept per RULE 0 (extend-never-remove). Guarded by the no-restricted-imports rule in
 * .eslintrc.json so a mistaken import fails the build.
 */
/**
 * Shared cron authentication — all cron routes must call this.
 * On Vercel Pro, Vercel automatically adds the Authorization header with CRON_SECRET.
 * External callers must pass: Authorization: Bearer <CRON_SECRET>
 */
export function verifyCronAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // misconfigured — fail closed
  const auth = req.headers.get('authorization') ?? req.headers.get('x-cron-secret')
  return auth === `Bearer ${secret}`
}

export function cronUnauthorized() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}
