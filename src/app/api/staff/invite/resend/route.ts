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

  // Try invite — if already registered, send magic link instead so email actually goes out
  const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `https://www.ariaos.site/staff/accept-invite`,
    data: { business_id, staff_member_id, role: 'staff' },
  })
  if (inviteError) {
    const alreadyRegistered = inviteError.message?.toLowerCase().includes('already registered') || inviteError.message?.includes('already been registered')
    if (!alreadyRegistered) return NextResponse.json({ error: inviteError.message }, { status: 500 })
    // Already registered — generate magic link then send via Resend directly
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `https://www.ariaos.site/staff/accept-invite` },
    })
    if (linkError) return NextResponse.json({ error: `Could not send email: ${linkError.message}` }, { status: 500 })
    if (linkData?.properties?.action_link) {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'AriaOS <support@ariaos.site>',
          to: [email],
          subject: "Your AriaOS Staff Portal invitation",
          html: `
            <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
              <h2 style="color:#2D5240;margin-bottom:8px;">Your staff portal invite</h2>
              <p style="color:#444;margin-bottom:24px;">Click below to access your AriaOS staff portal — view shifts, submit leave, and manage your availability.</p>
              <a href="${linkData.properties.action_link}" style="display:inline-block;background:#2D5240;color:#7FB897;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
                Open Staff Portal
              </a>
              <p style="color:#999;font-size:12px;margin-top:24px;">This link expires in 24 hours.</p>
            </div>
          `,
        }),
      })
      if (!resendRes.ok) {
        const err = await resendRes.text()
        console.error('[resend-invite] Resend API failed:', err)
        return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
      }
    }
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
  const { error: smErr } = await supabaseAdmin
    .from('staff_members')
    .update({ invite_sent_at: new Date().toISOString() })
    .eq('id', staff_member_id)
  if (smErr) console.error('[resend] staff_members update failed:', smErr.message)

  return NextResponse.json({ ok: true, email })
}

export const POST = withErrorCapture('staff/invite/resend', _POST)
