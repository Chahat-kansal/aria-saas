export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Find staff member linked to this user
  const { data: sm } = await supabase.from('staff_members')
    .select('id,business_id').eq('user_id', user.id).maybeSingle()

  if (!sm) {
    // Try to find by email and link
    const { data: byEmail } = await supabase.from('staff_members')
      .select('id,business_id')
      .or(`personal_email.eq.${user.email},work_email.eq.${user.email}`)
      .maybeSingle()

    if (byEmail) {
      await supabaseAdmin.from('staff_members').update({
        user_id: user.id, portal_enabled: true,
      }).eq('id', String(byEmail.id))

      await supabaseAdmin.from('staff_invites').update({
        status: 'accepted', accepted_at: new Date().toISOString(),
      }).eq('staff_member_id', String(byEmail.id)).eq('status', 'pending')

      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  }

  await supabaseAdmin.from('staff_members').update({ portal_enabled: true }).eq('id', String(sm.id))

  await supabaseAdmin.from('staff_invites').update({
    status: 'accepted', accepted_at: new Date().toISOString(),
  }).eq('staff_member_id', String(sm.id)).eq('status', 'pending')

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('staff/portal/accept-invite', _POST)
