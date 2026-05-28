export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'

// Public — an anonymous visitor reports a message. Body: { message_id, business_id, reason? }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { message_id?: string; business_id?: string; reason?: string }
    if (!body.message_id || !body.business_id) {
      return NextResponse.json({ error: 'message_id and business_id required' }, { status: 400 })
    }
    const member = await getCommunityMember()
    await supabaseAdmin.from('community_message_reports').insert({
      message_id: body.message_id,
      business_id: body.business_id,
      reported_by_session_token: member?.session_token ?? null,
      reason: (body.reason ?? '').toString().slice(0, 280) || null,
      status: 'pending',
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[community/report]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
