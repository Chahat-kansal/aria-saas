export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { id } = params
  const body = await req.json() as { name?: string }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data: quote } = await supabaseAdmin
    .from('quotes')
    .select('id,business_id,status,customer_email,quote_amount,quote_breakdown,expires_at')
    .eq('id', id)
    .maybeSingle()
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (quote.status === 'accepted') return NextResponse.json({ error: 'Already accepted' }, { status: 400 })
  if (quote.expires_at && new Date(quote.expires_at as string) < new Date()) {
    return NextResponse.json({ error: 'Quote has expired' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? null

  const { data, error } = await supabaseAdmin.from('quotes').update({
    status: 'accepted',
    accepted_at: new Date().toISOString(),
    accepted_by_name: body.name!.trim(),
    acceptance_ip: ip,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Email notifications
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name,user_id')
    .eq('id', quote.business_id as string)
    .maybeSingle()

  const resendKey = process.env.RESEND_API_KEY
  if (resendKey && biz) {
    const bizName = (biz as { name: string; user_id: string }).name
    const from = process.env.RESEND_FROM_DOMAIN
      ? `${bizName} <quotes@${process.env.RESEND_FROM_DOMAIN}>`
      : `${bizName} <onboarding@resend.dev>`
    const qb = (quote.quote_breakdown ?? {}) as Record<string, unknown>
    const quoteNum = (qb.quoteNumber as string | undefined) ?? id.slice(0, 8)
    const total = Number(quote.quote_amount ?? 0)
    const acceptedName = body.name!.trim()
    const acceptedDate = new Date().toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' })

    // Email customer
    if (quote.customer_email) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: quote.customer_email as string,
          subject: `Quote #${quoteNum} accepted — ${bizName}`,
          html: `<p>Hi ${acceptedName},</p><p>Thank you for accepting quote <strong>#${quoteNum}</strong> from <strong>${bizName}</strong>.</p><p><strong>Total: A$${total.toFixed(2)}</strong></p><p>Accepted: ${acceptedDate}</p><p>The ${bizName} team will be in touch soon to confirm next steps.</p>`,
        }),
      }).catch(() => {})
    }

    // Email owner
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(
      (biz as { name: string; user_id: string }).user_id
    )
    if (user?.email) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: user.email,
          subject: `✅ Quote #${quoteNum} accepted by ${acceptedName}`,
          html: `<p>Your quote <strong>#${quoteNum}</strong> (A$${total.toFixed(2)}) has been accepted by <strong>${acceptedName}</strong>.</p><p>Accepted: ${acceptedDate}</p>`,
        }),
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, quote: data })
}
