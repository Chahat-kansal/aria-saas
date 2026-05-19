import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function sendInviteEmail(email: string, actionLink: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AriaOS <support@ariaos.site>',
      to: [email],
      subject: "You're invited to join the AriaOS Staff Portal",
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <h2 style="color:#2D5240;margin-bottom:8px;">You've been invited to AriaOS</h2>
          <p style="color:#444;margin-bottom:24px;">Your employer has added you to their AriaOS staff portal. Click below to set up your account and access your shifts, leave requests, and more.</p>
          <a href="${actionLink}" style="display:inline-block;background:#2D5240;color:#7FB897;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            Accept Invite &amp; Set Up Account
          </a>
          <p style="color:#999;font-size:12px;margin-top:24px;">This link expires in 24 hours. If you didn't expect this, ignore this email.</p>
        </div>
      `,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[staff/invites] Resend send failed:', err)
  }
}

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
    // Generate the magic link URL then send via Resend directly
    const { data: linkData, error: mlError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `https://www.ariaos.site/staff/accept-invite` },
    })
    if (mlError) {
      console.error('[staff/invites] magiclink failed:', mlError.message)
    } else if (linkData?.properties?.action_link) {
      await sendInviteEmail(email, linkData.properties.action_link)
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

  const { error: updateErr } = await supabaseAdmin.from('staff_members').update({
    user_id: userId,
    portal_enabled: false,
    invite_sent_at: new Date().toISOString(),
  }).eq('id', staffMemberId)
  if (updateErr) console.error('[staff/invites] staff_members update failed:', updateErr.message, 'staff_id:', staffMemberId)

  return { ok: true }
}
