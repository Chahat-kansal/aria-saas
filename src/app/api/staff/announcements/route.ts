export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getActiveAnnouncements } from '@/lib/staff/messages'
import { getBid } from '@/lib/auth/get-bid'

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ announcements: [] })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ announcements: [] })
  const announcements = await getActiveAnnouncements(bid)
  return NextResponse.json({ announcements })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    title?: string; body?: string; priority?: string; expires_at?: string
  }
  const title = String(body.title ?? '').trim().slice(0, 200)
  const annBody = String(body.body ?? '').trim()
  const priority = ['low','normal','high','urgent'].includes(String(body.priority ?? '')) ? String(body.priority) : 'normal'
  if (!title || !annBody) return NextResponse.json({ error: 'title and body required' }, { status: 400 })

  const { data, error } = await supabase.from('staff_announcements').insert({
    business_id: bid, posted_by: user.id, title, body: annBody, priority,
    expires_at: body.expires_at ? String(body.expires_at) : null,
  }).select('id,title,priority,created_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ announcement: data }, { status: 201 })
}

export const GET = withErrorCapture('staff/announcements', _GET)
export const POST = withErrorCapture('staff/announcements', _POST)
