export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

// GET /api/pos/loyalty/config
// Returns { config: LoyaltyConfig | null } — shape the POS terminal reads.
// Previously read from businesses.loyalty_* cols (legacy); now reads pos_loyalty_config.
async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ config: null })

  const { data } = await supabaseAdmin
    .from('pos_loyalty_config')
    .select('program_type, points_per_dollar, point_value_cents, stamps_to_reward, stamp_reward_text')
    .eq('business_id', bid)
    .maybeSingle()

  if (!data) return NextResponse.json({ config: null })

  return NextResponse.json({
    config: {
      program_type:    (data as { program_type?: string | null }).program_type    ?? 'points',
      points_per_dollar: Number((data as { points_per_dollar?: number | null }).points_per_dollar    ?? 1),
      point_value_cents: Number((data as { point_value_cents?: number | null }).point_value_cents    ?? 1),
      stamps_to_reward:  Number((data as { stamps_to_reward?: number | null }).stamps_to_reward      ?? 10),
      stamp_reward_text: (data as { stamp_reward_text?: string | null }).stamp_reward_text ?? 'Free item',
    },
  })
}

export const GET = withErrorCapture('pos/loyalty/config', _GET)