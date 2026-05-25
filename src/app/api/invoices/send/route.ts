export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

function buildInvoiceHtml(
  biz: { name: string; abn?: string | null; address?: string | null; phone?: string | null },
  inv: Record<string, unknown>,
  lines: Record<string, unknown>[],
): string {
  const issueDate = inv.issue_date ? new Date(inv.issue_date as string).toLocaleDateString('en-AU') : ''
  const dueDate = inv.due_date ? new Date(inv.due_date as string).toLocaleDateString('en-AU') : ''
  const subtotal = (Number(inv.subtotal) || 0).toFixed(2)
  const gstTotal = (Number(inv.gst_total) || 0).toFixed(2)
  const total = (Number(inv.total) || 0).toFixed(2)

  const lineRows = lines.map(l => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;">${l.description ?? ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;text-align:center;">${l.quantity ?? 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;text-align:right;">$${(Number(l.unit_price) || 0).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;text-align:center;">${l.gst_applicable ? 'Yes' : 'No'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;text-align:right;">$${(Number(l.line_total) || 0).toFixed(2)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Tax Invoice ${inv.invoice_number}</title></head>
<body style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:32px;color:#1a1a1a;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
    <div>
      <h1 style="font-size:24px;font-weight:700;color:#2D5240;margin:0 0 4px;">TAX INVOICE</h1>
      <p style="margin:0;font-size:18px;font-weight:600;">${biz.name}</p>
      ${biz.abn ? `<p style="margin:2px 0;font-size:13px;color:#555;">ABN: ${biz.abn}</p>` : ''}
      ${biz.address ? `<p style="margin:2px 0;font-size:13px;color:#555;">${biz.address}</p>` : ''}
      ${biz.phone ? `<p style="margin:2px 0;font-size:13px;color:#555;">${biz.phone}</p>` : ''}
    </div>
    <div style="text-align:right;">
      <p style="margin:0;font-size:15px;font-weight:600;color:#2D5240;">${inv.invoice_number}</p>
      <p style="margin:2px 0;font-size:13px;color:#555;">Issue date: ${issueDate}</p>
      ${dueDate ? `<p style="margin:2px 0;font-size:13px;color:#555;">Due date: ${dueDate}</p>` : ''}
    </div>
  </div>

  <div style="background:#f5faf7;border-radius:6px;padding:16px;margin-bottom:24px;">
    <p style="margin:0;font-size:13px;color:#555;">Bill to:</p>
    <p style="margin:4px 0;font-size:15px;font-weight:600;">${inv.bill_to_name}</p>
    ${inv.bill_to_email ? `<p style="margin:2px 0;font-size:13px;color:#555;">${inv.bill_to_email}</p>` : ''}
    ${inv.bill_to_address ? `<p style="margin:2px 0;font-size:13px;color:#555;">${inv.bill_to_address}</p>` : ''}
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <thead>
      <tr style="background:#2D5240;color:#fff;">
        <th style="padding:10px 12px;text-align:left;font-size:13px;">Description</th>
        <th style="padding:10px 12px;text-align:center;font-size:13px;">Qty</th>
        <th style="padding:10px 12px;text-align:right;font-size:13px;">Unit Price</th>
        <th style="padding:10px 12px;text-align:center;font-size:13px;">GST</th>
        <th style="padding:10px 12px;text-align:right;font-size:13px;">Total</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <div style="margin-left:auto;width:260px;">
    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#555;">
      <span>Subtotal (ex-GST)</span><span>$${subtotal}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#555;">
      <span>GST (10%)</span><span>$${gstTotal}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:16px;font-weight:700;border-top:2px solid #2D5240;margin-top:6px;">
      <span>Total (AUD)</span><span>$${total}</span>
    </div>
  </div>

  ${inv.notes ? `<p style="margin-top:24px;font-size:13px;color:#555;"><strong>Notes:</strong> ${inv.notes}</p>` : ''}
  <p style="margin-top:32px;font-size:11px;color:#999;text-align:center;">This is a tax invoice for GST purposes. ABN: ${biz.abn ?? 'N/A'}</p>
</body>
</html>`
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { invoiceId, sendMethod } = body
  if (!invoiceId || !sendMethod) return NextResponse.json({ error: 'invoiceId and sendMethod required' }, { status: 400 })
  if (!['email', 'sms'].includes(sendMethod)) return NextResponse.json({ error: 'sendMethod must be email or sms' }, { status: 400 })

  const { data: inv } = await supabaseAdmin.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses')
    .select('id, name, abn, address, phone').eq('id', inv.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: lineRows } = await supabaseAdmin
    .from('invoice_line_items').select('*').eq('invoice_id', invoiceId).order('position')

  const html = buildInvoiceHtml(biz, inv, lineRows ?? [])

  // Upload HTML to Vercel Blob
  let pdfUrl = inv.pdf_url as string | null
  try {
    const blob = await put(
      `invoices/${inv.business_id}/${invoiceId}.html`,
      html,
      { access: 'public', contentType: 'text/html' },
    )
    pdfUrl = blob.url
  } catch {
    // Non-fatal — proceed without blob URL
  }

  // Send via chosen channel
  if (sendMethod === 'email') {
    const toEmail = inv.bill_to_email as string | null
    if (!toEmail) return NextResponse.json({ error: 'No email address on invoice' }, { status: 400 })

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'Email not configured' }, { status: 503 })

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_DOMAIN
        ? `${biz.name} <invoices@${process.env.RESEND_FROM_DOMAIN}>`
        : `${biz.name} <onboarding@resend.dev>`,  // resend sandbox — works without domain verification
        to: toEmail,
        subject: `Tax Invoice ${inv.invoice_number} from ${biz.name} — $${(Number(inv.total) || 0).toFixed(2)} AUD`,
        html,
      }),
    })
    if (!emailRes.ok) {
      const errText = await emailRes.text().catch(() => emailRes.statusText)
      return NextResponse.json({ error: `Email failed: ${errText}` }, { status: 502 })
    }
  } else {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_PHONE_NUMBER
    if (!accountSid || !authToken || !from) return NextResponse.json({ error: 'SMS not configured' }, { status: 503 })

    const rawPhone = (inv.bill_to_phone ?? '') as string
    if (!rawPhone) return NextResponse.json({ error: 'No phone on invoice' }, { status: 400 })
    const phone = rawPhone.replace(/\s/g, '').replace(/^0/, '+61')
    const dueStr = inv.due_date ? ` due ${new Date(inv.due_date as string).toLocaleDateString('en-AU')}` : ''
    const smsBody = `Invoice ${inv.invoice_number} from ${biz.name} for $${(Number(inv.total) || 0).toFixed(2)} AUD${dueStr}.${pdfUrl ? ' View: ' + pdfUrl : ''}`

    const smsRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, From: from, Body: smsBody }).toString(),
    })
    if (!smsRes.ok) {
      const err = await smsRes.json().catch(() => ({}))
      return NextResponse.json({ error: (err as Record<string, unknown>).message ?? 'SMS failed' }, { status: 502 })
    }
  }

  const { data: updated, error: updateErr } = await supabaseAdmin.from('invoices').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
    send_method: sendMethod,
    pdf_url: pdfUrl,
    updated_at: new Date().toISOString(),
  }).eq('id', invoiceId).select('*').single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ invoice: updated, pdfUrl })
}

export const POST = withErrorCapture('invoices/send', _POST)
