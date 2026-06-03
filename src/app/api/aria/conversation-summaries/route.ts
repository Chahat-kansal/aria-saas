export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabaseAdmin.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No active business' }, { status: 400 })

  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') ?? '7')
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

  const { data: summaries } = await supabaseAdmin
    .from('aria_conversation_summaries')
    .select('id, conversation_date, mode, summary, key_decisions, key_concerns, followup_promised, summarised_at')
    .eq('business_id', bid)
    .gte('conversation_date', since)
    .order('conversation_date', { ascending: false })
    .limit(10)

  return NextResponse.json({ summaries: summaries ?? [] })
}

export const GET = withErrorCapture('aria/conversation-summaries', _GET)
