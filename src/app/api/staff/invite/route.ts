export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { sendStaffInvite } from '@/lib/staff/invites'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const staff_member_id = String(body.staff_member_id ?? '').trim()
  if (!staff_member_id) return NextResponse.json({ error: 'staff_member_id required' }, { status: 400 })

  const { data: member } = await supabase.from('staff_members')
    .select('id, personal_email, work_email, business_id')
    .eq('id', staff_member_id).eq('business_id', bid).maybeSingle()
  if (!member) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  const email = String(body.email ?? member.work_email ?? member.personal_email ?? '').trim()
  if (!email) return NextResponse.json({ error: 'No email on file — add an email address first' }, { status: 400 })

  const result = await sendStaffInvite(bid, staff_member_id, email, user.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, email })
}

export const POST = withErrorCapture('staff/invite', _POST)
