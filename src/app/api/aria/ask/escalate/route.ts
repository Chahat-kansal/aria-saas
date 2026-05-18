export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { createSupportTicket } from '@/lib/aria/ask/escalate'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  const body = await req.json() as {
    subject?: string; message?: string; category?: string
    conversation_id?: string; aria_diagnosis?: string
  }
  if (!body.subject || !body.message) {
    return NextResponse.json({ error: 'subject and message required' }, { status: 400 })
  }

  const ticket = await createSupportTicket({
    businessId: bid,
    userEmail: user.email ?? 'unknown',
    subject: body.subject.slice(0, 200),
    message: body.message,
    category: body.category,
    conversationId: body.conversation_id,
    ariaDiagnosis: body.aria_diagnosis,
  })

  return NextResponse.json({ ticket_id: ticket.id })
}

export const POST = withErrorCapture('aria/ask/escalate', _POST)
