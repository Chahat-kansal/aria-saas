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
    if (authError.message?.toLowerCase().includes('already registered') || authError.message?.includes('already been registered')) {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
      const existing = users.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (existing) userId = existing.id
      else return { ok: false, error: `User already registered but not found: ${authError.message}` }
    } else {
      return { ok: false, error: authError.message }
    }
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

  await supabaseAdmin.from('staff_members').update({
    user_id: userId,
    portal_enabled: false,
    invite_sent_at: new Date().toISOString(),
  }).eq('id', staffMemberId).eq('business_id', businessId)

  return { ok: true }
}
