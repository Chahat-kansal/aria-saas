export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'

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

function checkAnthropicKey(): CheckResult {
  const key = process.env.ANTHROPIC_API_KEY
  return {
    ok: !!key && key.startsWith('sk-ant-'),
    ms: 0,
    note: key ? undefined : 'ANTHROPIC_API_KEY not set',
  }
}

export async function GET() {
  const [supabase, redis] = await Promise.all([checkSupabase(), checkRedis()])
  const anthropic = checkAnthropicKey()

  const checks = { supabase, redis, anthropic }
  const allOk = supabase.ok && anthropic.ok // redis is non-critical (rate limit degrades gracefully)
  const status = allOk ? 'ok' : 'degraded'
  const httpStatus = allOk ? 200 : 503

  return Response.json(
    { status, timestamp: new Date().toISOString(), checks },
    { status: httpStatus },
  )
}
