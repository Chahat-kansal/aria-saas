export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolvePortalIdentity } from '@/lib/staff/portal'
import { getMessagesForBusiness, getActiveAnnouncements } from '@/lib/staff/messages'
import { createServerSupabaseClient } from '@/lib/supabase-server'

async function _GET(_req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [messages, announcements] = await Promise.all([
    getMessagesForBusiness(identity.business_id),
    getActiveAnnouncements(identity.business_id),
  ])

  // Filter messages to those sent to this staff member (or broadcasts)
  const filtered = (messages as Array<Record<string, unknown>>).filter(m =>
    m.is_broadcast || (m.recipient as Record<string,unknown> | null) === null ||
    String((m as { recipient_id?: unknown }).recipient_id ?? '') === identity.staff_member_id
  )

  // Mark message read
  const supabase = createServerSupabaseClient()
  const unread = filtered.filter(m => !m.read_at).map(m => String(m.id))
  if (unread.length > 0) {
    await supabase.from('staff_messages').update({ read_at: new Date().toISOString() })
      .in('id', unread).eq('business_id', identity.business_id)
  }

  return NextResponse.json({ messages: filtered, announcements })
}

export const GET = withErrorCapture('staff/portal/messages', _GET)
