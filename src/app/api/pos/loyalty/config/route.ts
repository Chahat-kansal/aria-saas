export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

const DEFAULTS = {
  program_type: 'points',
  points_per_dollar: 1,
  point_value_cents: 1,
  stamps_to_reward: 10,
  stamp_reward_text: 'Free coffee',
  birthday_reward_text: null,
  winback_after_days: 30,
  winback_reward_text: null,
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ config: DEFAULTS })

  const { data } = await supabase
    .from('pos_loyalty_config')
    .select('*')
    .eq('business_id', bid)
    .maybeSingle()

  return NextResponse.json({ config: data ?? { ...DEFAULTS, business_id: bid } })
}

export const GET = withErrorCapture('pos/loyalty/config', _GET)

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json()
  const payload: Record<string, unknown> = { business_id: bid, updated_at: new Date().toISOString() }
  const SAFE = ['program_type','points_per_dollar','point_value_cents','stamps_to_reward','stamp_reward_text','birthday_reward_text','winback_after_days','winback_reward_text'] as const
  for (const k of SAFE) {
    if (k in body) payload[k] = body[k]
  }

  const { error } = await supabase
    .from('pos_loyalty_config')
    .upsert(payload, { onConflict: 'business_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('pos/loyalty/config', _PATCH)