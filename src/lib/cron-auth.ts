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
