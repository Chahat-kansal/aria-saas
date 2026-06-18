export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createElement } from 'react'
import { render } from '@react-email/render'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { StaffLoginLinkEmail } from '@/emails/StaffLoginLinkEmail'

async function sendLoginLinkEmail(email: string, firstName: string, actionLink: string): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return
  // B28-REACT-EMAIL — body now a React Email component; transport (direct Resend), from, subject unchanged.
  const html = await render(createElement(StaffLoginLinkEmail, { firstName, actionLink }))
  const text = await render(createElement(StaffLoginLinkEmail, { firstName, actionLink }), { plainText: true })
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'AriaOS <support@ariaos.site>',
      to: [email],
      subject: 'Your login link for AriaOS Staff Portal',
      html,
      text,
    }),
  })
  if (!res.ok) console.error('[staff/send-login-link] Resend failed:', await res.text())
}

async function _POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()

  // 1. Authenticate the caller (owner must be logged in)
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2+3+4. Load the target staff member with an inner join to verify the caller owns the business.
  // The join filters out rows where businesses.user_id !== the caller — a single query does both
  // "find the staff member" and "verify ownership" without a separate businesses lookup.
  const { data: sm } = await supabase
    .from('staff_members')
    .select('id, business_id, user_id, personal_email, work_email, first_name, businesses!inner(user_id)')
    .eq('id', params.id)
    .maybeSingle()

  // No row means the staff member doesn't exist OR doesn't belong to this owner
  if (!sm) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })

  // Belt-and-suspenders: explicit ownership check after the join.
  // Supabase types the join result as an array; the inner join guarantees at most one row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bizOwnerUid: string | undefined = (sm.businesses as any)?.[0]?.user_id ?? (sm.businesses as any)?.user_id
  if (bizOwnerUid !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 5. Derive email from the OWNED staff member row only — NEVER from request body
  const email = String(sm.work_email ?? sm.personal_email ?? '').trim()
  if (!email) {
    return NextResponse.json({ error: 'No email on file for this staff member — add an email address first' }, { status: 400 })
  }

  // 6. Generate the magic link (requires admin key — user JWT cannot generate links)
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'https://www.ariaos.site/staff/accept-invite' },
  })
  if (linkErr || !linkData?.properties?.action_link) {
    console.error('[staff/send-login-link] generateLink failed:', linkErr?.message)
    return NextResponse.json({ error: 'Failed to generate login link — please try again' }, { status: 500 })
  }

  // 7. Send via Resend
  await sendLoginLinkEmail(email, String(sm.first_name ?? 'there'), linkData.properties.action_link)

  return NextResponse.json({ ok: true, email })
}

export const POST = withErrorCapture('staff/[id]/send-login-link', _POST)
