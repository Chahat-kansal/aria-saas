export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const DEFAULTS = {
  program_type: 'points',
  points_per_dollar: 1,
  point_value_cents: 1,
  stamps_to_reward: 10,
  stamp_reward_text: 'Free coffee',
  birthday_reward_text: null as string | null,
  winback_after_days: 30,
  winback_reward_text: null as string | null,
}

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ config: DEFAULTS })

  const { data } = await supabaseAdmin.from('pos_loyalty_config').select('*').eq('business_id', bid).maybeSingle()
  return NextResponse.json({ config: data ?? { ...DEFAULTS, business_id: bid } })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const SAFE = [
    'program_type', 'points_per_dollar', 'point_value_cents', 'stamps_to_reward', 'stamp_reward_text',
    'birthday_reward_text', 'winback_after_days', 'winback_reward_text',
    // auto-enrol (public sign-up) + tiers + referral + expiry
    'public_enrol_enabled', 'points_expiry_days', 'referral_bonus_points', 'referee_bonus_points',
    'tier_silver_points', 'tier_gold_points', 'tier_platinum_points', 'enrol_page_slug',
  ] as const
  const payload: Record<string, unknown> = { business_id: bid, updated_at: new Date().toISOString() }
  for (const k of SAFE) if (k in body) payload[k] = body[k]

  // enrol_page_slug — public URL identifier: validate format + ensure no other business owns it.
  if ('enrol_page_slug' in payload) {
    const raw = payload.enrol_page_slug
    if (raw === null || raw === '') {
      payload.enrol_page_slug = null
    } else {
      const slug = String(raw).trim().toLowerCase()
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 40) {
        return NextResponse.json({ error: 'Link name must be 2–40 lowercase letters, numbers, or hyphens.' }, { status: 400 })
      }
      const { data: clash } = await supabaseAdmin.from('pos_loyalty_config')
        .select('business_id').eq('enrol_page_slug', slug).neq('business_id', bid).limit(1).maybeSingle()
      if (clash) return NextResponse.json({ error: 'That link name is already taken — try another.' }, { status: 409 })
      payload.enrol_page_slug = slug
    }
  }

  const { error } = await supabaseAdmin.from('pos_loyalty_config').upsert(payload, { onConflict: 'business_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = await supabaseAdmin.from('pos_loyalty_config').select('*').eq('business_id', bid).single()
  return NextResponse.json({ ok: true, config: data })
}

export const GET  = withErrorCapture('loyalty/config', _GET)
export const POST = withErrorCapture('loyalty/config', _POST)
