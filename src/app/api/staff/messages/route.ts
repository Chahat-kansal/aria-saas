export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { sendSMS } from '@/lib/clicksend'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { sendStaffMessage, getMessagesForBusiness } from '@/lib/staff/messages'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ messages: [] })
  const messages = await getMessagesForBusiness(bid)
  return NextResponse.json({ messages })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    recipient_id?: string; subject?: string; body?: string; is_broadcast?: boolean
  }
  const isBroadcast = Boolean(body.is_broadcast) || !body.recipient_id
  const subject = String(body.subject ?? '').trim().slice(0, 200)
  const msgBody = String(body.body ?? '').trim()
  if (!msgBody) return NextResponse.json({ error: 'body required' }, { status: 400 })

  // Find or create manager staff_members row
  let senderId: string | null = null
  const { data: existing } = await supabase.from('staff_members')
    .select('id').eq('business_id', bid).eq('user_id', user.id).maybeSingle()
  if (existing) {
    senderId = String(existing.id)
  } else {
    const { data: biz } = await supabase.from('businesses').select('name,owner_name').eq('id', bid).maybeSingle()
    const ownerName = String((biz as { owner_name?: string } | null)?.owner_name ?? 'Manager')
    const { data: created } = await supabase.from('staff_members').insert({
      business_id: bid, first_name: ownerName.split(' ')[0],
      last_name: ownerName.split(' ').slice(1).join(' ') || '',
      position: 'Manager', employment_type: 'full_time',
      user_id: user.id, portal_enabled: false, color: '#2D5240',
    }).select('id').single()
    if (created) senderId = String((created as { id: string }).id)
  }
  if (!senderId) return NextResponse.json({ error: 'Sender not found' }, { status: 500 })

  // Broadcast via Twilio SMS
  if (isBroadcast) {
    const { data: allStaff } = await supabase.from('staff_members')
      .select('mobile,first_name').eq('business_id', bid).eq('status', 'active')
    for (const sm of allStaff ?? []) {
      if (!sm.mobile) continue
      sendSMS(String(sm.mobile), `${subject ? subject + ': ' : ''}${msgBody.slice(0, 140)}`).catch(() => null)
    }
  }

  const id = await sendStaffMessage({
    businessId: bid, senderId,
    recipientId: isBroadcast ? null : (body.recipient_id ? String(body.recipient_id) : null),
    subject, body: msgBody, isBroadcast,
  })
  if (!id) return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  return NextResponse.json({ ok: true, id }, { status: 201 })
}

export const GET = withErrorCapture('staff/messages', _GET)
export const POST = withErrorCapture('staff/messages', _POST)
