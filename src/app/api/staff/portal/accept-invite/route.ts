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

  // Strategy: find the staff member linked to this user by user_id OR email
  // Use admin client throughout to bypass RLS restrictions on staff tables

  // Step 1: try by user_id first
  const { data: smByUserId } = await supabaseAdmin
    .from('staff_members')
    .select('id, business_id, portal_enabled, invite_sent_at')
    .eq('user_id', user.id)
    .maybeSingle()

  // Step 2: try by email
  const { data: smByEmail } = !smByUserId ? await supabaseAdmin
    .from('staff_members')
    .select('id, business_id, portal_enabled, invite_sent_at')
    .or(`personal_email.eq.${user.email},work_email.eq.${user.email}`)
    .maybeSingle() : { data: null }

  const sm = smByUserId ?? smByEmail

  if (!sm) {
    // No match — still redirect to portal, don't block the user
    return NextResponse.json({ ok: true, warning: 'Staff member not found for this account' })
  }

  // Step 3: update staff_member — link user_id and enable portal
  const { error: smErr } = await supabaseAdmin
    .from('staff_members')
    .update({
      user_id: user.id,
      portal_enabled: true,
      invite_sent_at: sm.invite_sent_at ?? null, // preserve
    })
    .eq('id', String(sm.id))

  if (smErr) {
    console.error('[accept-invite] staff_members update failed:', smErr.message)
  }

  // Step 4: mark all pending invites for this staff member as accepted
  const { error: invErr } = await supabaseAdmin
    .from('staff_invites')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('staff_member_id', String(sm.id))
    .in('status', ['pending', 'sent'])

  if (invErr) {
    console.error('[accept-invite] staff_invites update failed:', invErr.message)
  }

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('staff/portal/accept-invite', _POST)
