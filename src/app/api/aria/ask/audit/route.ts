export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ log: [] })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ log: [] })

  const { data } = await supabase.from('aria_action_log')
    .select('id,action_type,entity_type,entity_ids,after_state,triggered_by,executed_at,rolled_back_at,message_excerpt')
    .eq('business_id', bid)
    .order('executed_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ log: data ?? [] })
}

export const GET = withErrorCapture('aria/ask/audit', _GET)
