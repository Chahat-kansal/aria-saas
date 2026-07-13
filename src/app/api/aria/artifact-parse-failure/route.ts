export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getBid } from '@/lib/auth/get-bid'

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const bid = await getBid(supabase, user.id)
    if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 401 })

    const rl = await checkRateLimit('standard', user.id)
    if (!rl.ok) {
      const retryAfter = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000))
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const { raw, type } = await req.json().catch(() => ({ raw: '', type: 'unknown' })) as { raw?: string; type?: string }
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: bid,
      agent_key: 'artifact_parse_failure',
      provider: 'other',
      model_id: 'parser',
      success: false,
      error_message: `Failed to parse ${type ?? 'unknown'} artifact`,
      request_summary: ('[' + (type ?? 'unknown') + '] ' + (raw ?? '')).slice(0, 200),
      created_at: new Date().toISOString(),
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
