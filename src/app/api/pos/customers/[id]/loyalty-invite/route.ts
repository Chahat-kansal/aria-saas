export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveOwnerBusinessId as getBid } from '@/lib/community/resolveOwnerBusinessId'
import { decryptCustomerPII } from '@/lib/aria/customer-pii'
import { sendEmail, sendSMS } from '@/lib/external-apis'
import { genToken } from '@/lib/loyalty/auth'

// LOY-P1-IDENTITY — cashier-assisted loyalty enrolment. The owner triggers a tokenised
// set-PIN invite for an EXISTING pos_customers row; the customer taps it, sets a PIN, and
// converges on the same auth row (keeping any points already earned). Owner-only + ownership-scoped.

type Params = { params: Promise<{ id: string }> | { id: string } }

async function _POST(req: Request, { params }: Params) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { channel?: 'email' | 'sms' }
  const channel = body.channel === 'sms' ? 'sms' : 'email'

  // Ownership: the customer must belong to the caller's business (RULE 7).
  const { data: cust } = await supabaseAdmin.from('pos_customers')
    .select('id, name, name_enc, email, email_enc, phone, phone_enc')
    .eq('id', id).eq('business_id', bid).maybeSingle()
  if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const pii = decryptCustomerPII(cust as Record<string, unknown>, bid)
  const email = (pii.email ?? '').trim().toLowerCase()
  const phone = (pii.phone ?? '').trim()
  // Loyalty sign-in is email + PIN — an identity email is required even for SMS delivery.
  if (!email) return NextResponse.json({ error: 'Add an email to this customer first — loyalty sign-in uses email + PIN.' }, { status: 400 })
  if (channel === 'sms' && !phone) return NextResponse.json({ error: 'This customer has no phone number for SMS.' }, { status: 400 })

  // Upsert the auth row for this customer (idempotent on business_id + email).
  const token = genToken()
  const { data: existing } = await supabaseAdmin.from('pos_customer_auth')
    .select('id').eq('business_id', bid).ilike('email', email).maybeSingle()
  if (existing) {
    await supabaseAdmin.from('pos_customer_auth').update({
      customer_id: cust.id, invite_token: token, invite_sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', existing.id)
  } else {
    await supabaseAdmin.from('pos_customer_auth').insert({
      business_id: bid, customer_id: cust.id, email, invite_token: token, invite_sent_at: new Date().toISOString(),
    })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_URL ?? 'https://www.ariaos.site'
  const link = `${appUrl}/loyalty/set-pin?token=${encodeURIComponent(token)}`
  const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', bid).maybeSingle()
  const bizName = (biz?.name as string) ?? 'Our rewards'
  const greet = pii.name ? `Hi ${pii.name.split(' ')[0]}, ` : ''

  let delivered = false
  if (channel === 'sms') {
    delivered = await sendSMS(phone, `${greet}set up your ${bizName} rewards PIN here: ${link}`)
  } else {
    const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#0a0a0a">
      <h2 style="font-family:Georgia,serif;font-style:italic;margin:0 0 8px">${bizName} Rewards</h2>
      <p style="font-size:15px;color:#555;margin:0 0 16px">${greet}you're set up for ${bizName} rewards. Tap below to choose a 6-digit PIN and start tracking your points.</p>
      <a href="${link}" style="display:inline-block;background:#d9f54e;color:#0a0a0a;font-weight:700;text-decoration:none;padding:12px 22px;border:1.5px solid #0a0a0a;border-radius:12px">Set up my PIN →</a>
      <p style="font-size:12px;color:#888;margin:16px 0 0">If you didn't expect this, you can ignore it.</p>
    </div>`
    delivered = await sendEmail({ to: email, subject: `Set up your ${bizName} rewards PIN`, html, from_name: bizName }, { category: 'transactional', businessId: bid })
  }

  // Don't fail the cashier action on a provider hiccup — the token is stored and re-sendable.
  return NextResponse.json({ ok: true, channel, delivered })
}

export const POST = withErrorCapture('pos/customers/loyalty-invite', _POST)
