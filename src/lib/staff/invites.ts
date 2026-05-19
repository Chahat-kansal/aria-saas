import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function sendStaffInvite(
  businessId: string,
  staffMemberId: string,
  email: string,
  invitedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/staff/accept-invite`,
      data: { business_id: businessId, staff_member_id: staffMemberId, role: 'staff' },
    }
  )
  if (authError) return { ok: false, error: authError.message }

  const userId = authData.user?.id
  if (!userId) return { ok: false, error: 'Auth user not created' }

  const { error: inviteError } = await supabaseAdmin.from('staff_invites').insert({
    business_id: businessId,
    staff_member_id: staffMemberId,
    email,
    invited_by: invitedBy,
    status: 'pending',
  })
  if (inviteError) return { ok: false, error: inviteError.message }

  await supabaseAdmin.from('staff_members').update({
    user_id: userId,
    portal_enabled: true,
    invite_sent_at: new Date().toISOString(),
  }).eq('id', staffMemberId).eq('business_id', businessId)

  return { ok: true }
}
