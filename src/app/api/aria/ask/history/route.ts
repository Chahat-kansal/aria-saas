export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ conversations: [] }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ conversations: [] })

  const url = new URL(req.url)
  const withMessages = url.searchParams.get('messages') === 'true'
  const id = url.searchParams.get('id')

  if (id) {
    const { data } = await supabaseAdmin
      .from('aria_conversations')
      .select('id,title,messages,message_count,last_intent,last_message_at,has_escalated')
      .eq('id', id)
      .eq('business_id', bid)
      .maybeSingle()
    return NextResponse.json({ conversation: data ?? null })
  }

  const select = withMessages
    ? 'id,title,messages,message_count,last_intent,last_message_at,has_escalated'
    : 'id,title,message_count,last_intent,last_message_at,has_escalated'

  const { data } = await supabaseAdmin
    .from('aria_conversations')
    .select(select)
    .eq('business_id', bid)
    .order('last_message_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ conversations: data ?? [] })
}

export const GET = withErrorCapture('aria/ask/history', _GET)
