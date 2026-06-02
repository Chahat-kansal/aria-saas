export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: bizRows } = await supabase.from('businesses').select('id').eq('user_id', user.id)
  if (!bizRows || bizRows.length === 0) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bizIds = bizRows.map((b: { id: string }) => b.id)

  const { data: order } = await supabaseAdmin
    .from('wholesale_orders')
    .select('*')
    .eq('id', params.id)
    .in('business_id', bizIds)
    .maybeSingle()
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Generate invoice if not yet done
  let invoiceId = order.invoice_id
  if (!invoiceId) {
    const genRes = await fetch(
      (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') +
        '/api/wholesale/orders/' + params.id + '/generate-invoice',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward cookie header for auth
          Cookie: req.headers.get('cookie') ?? '',
        },
      }
    )
    if (!genRes.ok) {
      const genJson = await genRes.json().catch(() => ({}))
      return NextResponse.json({ error: 'Invoice generation failed: ' + (genJson.error ?? 'unknown') }, { status: 500 })
    }
    const genJson = await genRes.json()
    invoiceId = genJson.invoice_id
  }

  if (!invoiceId) return NextResponse.json({ error: 'No invoice to send' }, { status: 400 })

  // Fetch invoice
  const { data: inv } = await supabaseAdmin.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Fetch customer
  let customer: Record<string, unknown> | null = null
  if (order.customer_id) {
    const { data: c } = await supabaseAdmin.from('customers').select('id, name, email, business_name').eq('id', order.customer_id).maybeSingle()
    customer = c
  }
  const toEmail = (customer?.email as string | null) || (inv.bill_to_email as string | null)
  if (!toEmail) return NextResponse.json({ error: 'No email address for customer' }, { status: 400 })

  // Fetch business
  const { data: biz } = await supabaseAdmin.from('businesses').select('name, abn').eq('id', order.business_id).single()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Fetch invoice items for email summary
  const { data: lineItems } = await supabaseAdmin
    .from('invoice_line_items')
    .select('description, quantity, unit_price, line_total')
    .eq('invoice_id', invoiceId)
    .order('position')

  const itemRowsHtml = (lineItems ?? []).map((l: Record<string, unknown>) =>
    '<tr style="border-bottom:1px solid #f0f0f0;">' +
    '<td style="padding:8px 12px;font-size:13px;">' + l.description + '</td>' +
    '<td style="padding:8px 12px;text-align:center;font-size:13px;">' + l.quantity + '</td>' +
    '<td style="padding:8px 12px;text-align:right;font-size:13px;">$' + (Number(l.unit_price) || 0).toFixed(2) + '</td>' +
    '<td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:600;">$' + (Number(l.line_total) || 0).toFixed(2) + '</td>' +
    '</tr>'
  ).join('')

  const dueDate = inv.due_date ? new Date(inv.due_date as string).toLocaleDateString('en-AU') : ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const subject = 'Invoice ' + (inv.invoice_number as string) + ' from ' + biz.name + ' — Due ' + dueDate

  const emailHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
'<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:32px;">' +
'<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">' +
'<div style="background:#2D5240;padding:24px 32px;">' +
'<h1 style="color:#fff;font-size:20px;margin:0;">' + biz.name + '</h1>' +
'<p style="color:#7FB897;margin:4px 0 0;font-size:13px;">Wholesale Invoice</p>' +
'</div>' +
'<div style="padding:28px 32px;">' +
'<p style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">Hi ' + ((customer?.name as string) || 'there') + ',</p>' +
'<p style="font-size:13px;color:#555;margin-bottom:20px;">Please find your invoice below. Payment is due by <strong>' + dueDate + '</strong>.</p>' +
'<div style="background:#f5faf7;border-radius:8px;padding:16px 20px;margin-bottom:20px;">' +
'<div style="display:flex;justify-content:space-between;">' +
'<span style="font-size:13px;color:#555;">Invoice</span><span style="font-size:15px;font-weight:700;color:#2D5240;">' + (inv.invoice_number as string) + '</span>' +
'</div>' +
'<div style="display:flex;justify-content:space-between;margin-top:8px;">' +
'<span style="font-size:13px;color:#555;">Order</span><span style="font-size:13px;color:#333;">' + (order.order_number as string) + '</span>' +
'</div>' +
'<div style="display:flex;justify-content:space-between;margin-top:8px;">' +
'<span style="font-size:13px;color:#555;">Amount Due</span><span style="font-size:18px;font-weight:700;color:#2D5240;">$' + (Number(inv.total) || 0).toFixed(2) + ' AUD</span>' +
'</div>' +
'</div>' +
'<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">' +
'<thead><tr style="background:#f0f0f0;">' +
'<th style="padding:8px 12px;text-align:left;font-size:12px;color:#666;">Item</th>' +
'<th style="padding:8px 12px;text-align:center;font-size:12px;color:#666;">Qty</th>' +
'<th style="padding:8px 12px;text-align:right;font-size:12px;color:#666;">Price</th>' +
'<th style="padding:8px 12px;text-align:right;font-size:12px;color:#666;">Total</th>' +
'</tr></thead>' +
'<tbody>' + itemRowsHtml + '</tbody>' +
'</table>' +
(inv.pdf_url
  ? '<div style="text-align:center;margin:24px 0;">' +
    '<a href="' + (inv.pdf_url as string) + '" style="display:inline-block;background:#2D5240;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Download Invoice PDF</a>' +
    '</div>'
  : '') +
(appUrl
  ? '<div style="text-align:center;margin-bottom:20px;">' +
    '<a href="' + appUrl + '/api/invoices/public/' + invoiceId + '" style="display:inline-block;background:#7FB897;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">View Invoice &amp; Pay Online</a>' +
    '</div>'
  : '') +
'</div>' +
'<div style="background:#f5f5f5;padding:16px 32px;text-align:center;">' +
'<p style="font-size:11px;color:#999;margin:0;">This invoice was generated by ' + biz.name + ' using Aria OS. ABN: ' + (biz.abn ?? 'N/A') + '</p>' +
'</div>' +
'</div>' +
'</body></html>'

  // Send via Resend
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'Email not configured' }, { status: 503 })

  const emailPayload: Record<string, unknown> = {
    from: process.env.RESEND_FROM_DOMAIN
      ? biz.name + ' <invoices@' + process.env.RESEND_FROM_DOMAIN + '>'
      : biz.name + ' <onboarding@resend.dev>',
    to: toEmail,
    subject,
    html: emailHtml,
  }

  // Attach PDF if available
  if (inv.pdf_url) {
    try {
      const pdfResp = await fetch(inv.pdf_url as string)
      if (pdfResp.ok) {
        const pdfBuf = Buffer.from(await pdfResp.arrayBuffer())
        emailPayload.attachments = [{
          filename: 'Invoice-' + (inv.invoice_number as string) + '.pdf',
          content: pdfBuf.toString('base64'),
        }]
      }
    } catch { /* non-fatal, send without attachment */ }
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(emailPayload),
  })

  if (!emailRes.ok) {
    const errText = await emailRes.text().catch(() => emailRes.statusText)
    return NextResponse.json({ error: 'Email failed: ' + errText }, { status: 502 })
  }

  const now = new Date().toISOString()

  // Update wholesale order
  await supabaseAdmin.from('wholesale_orders').update({
    sent_at: now,
    status: 'sent',
  }).eq('id', params.id)

  // Update invoice
  await supabaseAdmin.from('invoices').update({
    sent_at: now,
    status: 'sent',
  }).eq('id', invoiceId)

  // Log to aria_autopilot_actions
  try {
    await supabaseAdmin.from('aria_autopilot_actions').insert({
      action_type: 'wholesale_invoice_sent',
      business_id: order.business_id,
      status: 'completed',
      payload: { order_id: params.id, invoice_id: invoiceId, sent_to: toEmail },
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, sent_to: toEmail })
}

export const POST = withErrorCapture('wholesale/orders/[id]/send', _POST)
