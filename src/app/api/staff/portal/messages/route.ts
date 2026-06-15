export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolvePortalIdentity } from '@/lib/staff/portal'
import { getMessagesForBusiness, getActiveAnnouncements, sendStaffMessage } from '@/lib/staff/messages'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function _GET(_req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [messages, announcements] = await Promise.all([
    getMessagesForBusiness(identity.business_id),
    getActiveAnnouncements(identity.business_id),
  ])

  // Filter messages to those sent to this staff member (or broadcasts)
  const filtered = (messages as Array<Record<string, unknown>>).filter(m =>
    m.is_broadcast || (m.recipient as Record<string, unknown> | null) === null ||
    String((m as { recipient_id?: unknown }).recipient_id ?? '') === identity.staff_member_id
  )

  // STAFF-MSG-FIX — no longer auto-marks on load (that broke the unread indicator). Messages
  // stay unread until the staff OPENS one (PATCH below sets read_at).
  return NextResponse.json({ messages: filtered, announcements })
}

// STAFF-MSG-FIX PART 1 — mark a single message read when the staff opens it.
async function _PATCH(req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message_id } = await req.json().catch(() => ({})) as { message_id?: string }
  if (!message_id) return NextResponse.json({ error: 'message_id required' }, { status: 400 })

  // Service-role write, scoped server-side: only this staff's own (or broadcast) messages,
  // in their own business. (RLS recipient-update policy also covers this for user-client writes.)
  const { error } = await supabaseAdmin.from('staff_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', message_id)
    .eq('business_id', identity.business_id)
    .or(`recipient_id.eq.${identity.staff_member_id},is_broadcast.eq.true`)
    .is('read_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// STAFF-MSG-FIX PART 2 — reply to a message (staff → original sender), scoped to the business.
async function _POST(req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reply_to_id, body } = await req.json().catch(() => ({})) as { reply_to_id?: string; body?: string }
  const text = String(body ?? '').trim()
  if (!reply_to_id || !text) return NextResponse.json({ error: 'reply_to_id and body required' }, { status: 400 })

  // Look up the original message — scoped to this staff member's business (no cross-business).
  const { data: orig, error: origErr } = await supabaseAdmin.from('staff_messages')
    .select('id, sender_id, subject, is_broadcast')
    .eq('id', reply_to_id)
    .eq('business_id', identity.business_id)
    .maybeSingle()
  if (origErr) return NextResponse.json({ error: origErr.message }, { status: 500 })
  if (!orig) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  // A one-way message with no sender (pure announcement-style broadcast) can't be replied to.
  if (!orig.sender_id) return NextResponse.json({ error: 'This message is one-way and cannot be replied to' }, { status: 400 })

  const baseSubject = String(orig.subject ?? '').replace(/^re:\s*/i, '').trim()
  const subject = (baseSubject ? `Re: ${baseSubject}` : 'Re: (no subject)').slice(0, 200)

  // sender_id is set from the verified identity (never client input) → can't impersonate.
  const id = await sendStaffMessage({
    businessId: identity.business_id,
    senderId: identity.staff_member_id,
    recipientId: String(orig.sender_id),
    subject,
    body: text,
    isBroadcast: false,
  })
  if (!id) return NextResponse.json({ error: 'Failed to send reply' }, { status: 500 })
  return NextResponse.json({ ok: true, id })
}

export const GET = withErrorCapture('staff/portal/messages', _GET)
export const PATCH = withErrorCapture('staff/portal/messages', _PATCH)
export const POST = withErrorCapture('staff/portal/messages', _POST)
