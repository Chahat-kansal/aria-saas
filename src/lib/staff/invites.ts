import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function sendStaffInvite(
  businessId: string,
  staffMemberId: string,
  email: string,
  invitedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()

  let userId: string | undefined
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `https://www.ariaos.site/staff/accept-invite`,
      data: { business_id: businessId, staff_member_id: staffMemberId, role: 'staff' },
    }
  )
  if (authError) {
    const alreadyRegistered = authError.message?.toLowerCase().includes('already registered') || authError.message?.includes('already been registered')
    if (!alreadyRegistered) return { ok: false, error: authError.message }
    // Already registered — find their user_id and send a magic link instead
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
    const existing = users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!existing) return { ok: false, error: `User already registered but not found` }
    userId = existing.id
    // Send magic link so they actually receive an email
    // generateLink does NOT send email — use signInWithOtp to actually send
    const { error: otpError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `https://www.ariaos.site/staff/accept-invite`,
        data: { business_id: businessId, staff_member_id: staffMemberId, role: 'staff' },
      },
    })
    if (otpError) console.error('[staff/invites] generateLink invite failed:', otpError.message)
  } else {
    userId = authData.user?.id
  }
  if (!userId) return { ok: false, error: 'Auth user not created' }

  const { error: inviteError } = await supabaseAdmin.from('staff_invites').insert({
    business_id: businessId,
    staff_member_id: staffMemberId,
    email,
    invited_by: invitedBy,
    status: 'pending',
  })
  if (inviteError && !inviteError.message?.includes('42P01')) return { ok: false, error: inviteError.message }

  const { error: updateErr } = await supabaseAdmin.from('staff_members').update({
    user_id: userId,
    portal_enabled: false,
    invite_sent_at: new Date().toISOString(),
  }).eq('id', staffMemberId)
  if (updateErr) console.error('[staff/invites] staff_members update failed:', updateErr.message, 'staff_id:', staffMemberId)

  return { ok: true }
}
