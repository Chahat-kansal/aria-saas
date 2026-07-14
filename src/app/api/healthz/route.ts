export const dynamic = 'force-dynamic'

// AUDIT-CLEANUP-QUICK-1 — public liveness check for load balancers/uptime monitors. Deliberately
// does nothing but confirm the process is alive: no DB/Redis/Anthropic calls, no information beyond
// {ok:true}. The deep, dependency-checking version (Supabase/Redis/Anthropic/failover-key status)
// moved to /api/health/deep, now gated behind admin auth — see that route for why.
export async function GET() {
  return Response.json({ ok: true })
}
