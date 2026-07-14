export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { rateLimit } from '@/lib/security/rate-limit'
import { isAnthropicCircuitOpen } from '@/lib/aria/circuit-breaker'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

interface CheckResult { ok: boolean; ms: number; note?: string }

async function checkSupabase(): Promise<CheckResult> {
  const t = Date.now()
  try {
    const { error } = await supabaseAdmin
      .from('businesses')
      .select('id', { head: true, count: 'exact' })
      .limit(0)
    return { ok: !error, ms: Date.now() - t, note: error?.message }
  } catch (e) {
    return { ok: false, ms: Date.now() - t, note: (e as Error).message }
  }
}

async function checkRedis(): Promise<CheckResult> {
  const t = Date.now()
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return { ok: false, ms: 0, note: 'env vars not configured' }
  try {
    const res = await fetch(url + '/ping', {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(3000),
    })
    return { ok: res.ok, ms: Date.now() - t }
  } catch (e) {
    return { ok: false, ms: Date.now() - t, note: (e as Error).message }
  }
}

// API-RESILIENCE-1 — real Anthropic liveness, not just key presence. A 1-token Haiku ping, throttled
// to once / 60s (via the rate_limit_hit RPC) so dashboard polling doesn't burn tokens on every hit.
async function checkAnthropicLive(): Promise<CheckResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !key.startsWith('sk-ant-')) return { ok: false, ms: 0, note: 'ANTHROPIC_API_KEY not set' }

  let mayPing = true
  try { mayPing = (await rateLimit('health:anthropic-ping', 1, 60)).allowed } catch { mayPing = true }
  if (!mayPing) return { ok: true, ms: 0, note: 'key present; live ping throttled (60s cache)' }

  const t = Date.now()
  try {
    const client = new Anthropic({ apiKey: key, timeout: 4000, maxRetries: 0 })
    await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
    return { ok: true, ms: Date.now() - t, note: 'live' }
  } catch (e) {
    return { ok: false, ms: Date.now() - t, note: 'live ping failed: ' + (e as Error).message.slice(0, 100) }
  }
}

// Failover providers — key presence tells us whether degradation has anywhere to fall back to.
function checkFailoverKey(name: 'OPENAI_API_KEY' | 'GEMINI_API_KEY'): CheckResult {
  const v = process.env[name]
  return { ok: !!v, ms: 0, note: v ? 'key present (failover ready)' : name + ' not set' }
}

// AUDIT-CLEANUP-QUICK-1 — this pinged live Anthropic (a real, if throttled, spend) plus Redis and
// Supabase with zero auth, publicly reachable by anyone. Gated behind the same admin-email check the
// sibling health/stripe route already uses. Public liveness now lives at /api/healthz ({ok:true} only).
async function _GET() {
  const auth = createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [supabase, redis, anthropic, circuit] = await Promise.all([
    checkSupabase(), checkRedis(), checkAnthropicLive(), isAnthropicCircuitOpen(),
  ])
  const openai = checkFailoverKey('OPENAI_API_KEY')
  const gemini = checkFailoverKey('GEMINI_API_KEY')

  const checks = {
    supabase, redis, anthropic, openai, gemini,
    anthropic_circuit: { ok: !circuit.open, ms: 0, note: circuit.open ? 'OPEN — Aria is on backup providers' : 'closed' },
  }
  // Healthy if Supabase is up AND (Anthropic is live OR at least one failover key is present).
  const failoverReady = openai.ok || gemini.ok
  const allOk = supabase.ok && (anthropic.ok || failoverReady)
  const status = allOk ? 'ok' : 'degraded'
  const httpStatus = allOk ? 200 : 503

  return Response.json(
    { status, timestamp: new Date().toISOString(), failover_ready: failoverReady, checks },
    { status: httpStatus },
  )
}

export const GET = withErrorCapture('health/deep', _GET)
