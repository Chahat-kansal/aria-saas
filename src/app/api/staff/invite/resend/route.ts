export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { staff_member_id, business_id } = body
  if (!staff_member_id || !business_id) {
    return NextResponse.json({ error: 'staff_member_id and business_id required' }, { status: 400 })
  }

  // Verify caller owns this business
  const { data: biz } = await supabase.from('businesses').select('id, name').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify staff member belongs to this business
  const { data: sm } = await supabaseAdmin
    .from('staff_members')
    .select('id, first_name, last_name, work_email, personal_email, portal_enabled')
    .eq('id', staff_member_id)
    .eq('business_id', business_id)
    .single()
  if (!sm) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  const email = sm.work_email || sm.personal_email
  if (!email) return NextResponse.json({ error: 'No email on file — add an email address first' }, { status: 400 })

  // Expire old pending invites
  await supabaseAdmin
    .from('staff_invites')
    .update({ status: 'expired' })
    .eq('staff_member_id', staff_member_id)
    .eq('status', 'pending')

  // Re-send via Supabase auth admin (consistent with original invite flow)
  const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'}/staff/accept-invite`,
    data: { business_id, staff_member_id, role: 'staff' },
  })
  if (inviteError) {
    const alreadyRegistered = inviteError.message?.toLowerCase().includes('already registered') || inviteError.message?.includes('already been registered')
    if (!alreadyRegistered) return NextResponse.json({ error: inviteError.message }, { status: 500 })
    // Already registered — still log the invite record so staff can click accept link
  }

  // Insert fresh staff_invites record
  await supabaseAdmin.from('staff_invites').insert({
    business_id,
    staff_member_id,
    email,
    status: 'pending',
    invited_by: user.id,
    created_at: new Date().toISOString(),
  })

  // Update invite_sent_at
  await supabaseAdmin
    .from('staff_members')
    .update({ invite_sent_at: new Date().toISOString() })
    .eq('id', staff_member_id)

  return NextResponse.json({ ok: true, email })
}

export const POST = withErrorCapture('staff/invite/resend', _POST)
