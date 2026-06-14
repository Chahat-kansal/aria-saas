export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'


function calcNextDueDate(frequency: string, fromDate: string): string {
  const d = new Date(fromDate)
  if (frequency === 'weekly') d.setDate(d.getDate() + 7)
  else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

async function sendInvoiceEmail(
  resendKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  })
  return res.ok
}

function buildRecurringInvoiceHtml(
  biz: { name: string; abn?: string | null },
  inv: Record<string, unknown>,
  lines: Record<string, unknown>[],
  invoiceNumber: string,
  publicUrl: string,
): string {
  const dueDate = inv.due_date ? new Date(inv.due_date as string).toLocaleDateString('en-AU') : ''
  const total = (Number(inv.total) || 0).toFixed(2)
  const lineRows = lines.map(l =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;">${l.description ?? ''}</td>` +
    `<td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;text-align:center;">${l.quantity ?? 1}</td>` +
    `<td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;text-align:right;">$${(Number(l.unit_price) || 0).toFixed(2)}</td>` +
    `<td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;text-align:right;">$${(Number(l.line_total) || 0).toFixed(2)}</td></tr>`
  ).join('')
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Invoice ${invoiceNumber}</title></head>
<body style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:32px;color:#1a1a1a;">
<h1 style="font-size:22px;color:#2D5240;">TAX INVOICE — ${biz.name}</h1>
${biz.abn ? `<p style="font-size:13px;color:#555;">ABN: ${biz.abn}</p>` : ''}
<p style="font-size:15px;font-weight:600;">${invoiceNumber}${dueDate ? ` &nbsp;|&nbsp; Due: ${dueDate}` : ''}</p>
<p style="font-size:14px;font-weight:600;">Bill to: ${inv.bill_to_name}</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;">
<thead><tr style="background:#2D5240;color:#fff;">
<th style="padding:10px 12px;text-align:left;font-size:13px;">Description</th>
<th style="padding:10px 12px;text-align:center;font-size:13px;">Qty</th>
<th style="padding:10px 12px;text-align:right;font-size:13px;">Unit Price</th>
<th style="padding:10px 12px;text-align:right;font-size:13px;">Total</th>
</tr></thead><tbody>${lineRows}</tbody></table>
<div style="margin-left:auto;width:220px;">
<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;"><span>Subtotal</span><span>$${(Number(inv.subtotal) || 0).toFixed(2)}</span></div>
<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;"><span>GST</span><span>$${(Number(inv.gst_total) || 0).toFixed(2)}</span></div>
<div style="display:flex;justify-content:space-between;padding:10px 0;font-size:17px;font-weight:700;border-top:2px solid #2D5240;">
<span>Total (AUD)</span><span>$${total}</span></div></div>
${inv.notes ? `<p style="font-size:13px;color:#555;margin-top:16px;"><strong>Notes:</strong> ${inv.notes}</p>` : ''}
<p style="margin-top:24px;"><a href="${publicUrl}" style="padding:10px 20px;background:#2D5240;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">View & Pay Invoice</a></p>
<p style="margin-top:24px;font-size:11px;color:#999;">Tax invoice for GST purposes. ABN: ${biz.abn ?? 'N/A'} — Powered by Aria OS</p>
</body></html>`
}

async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const today = new Date().toISOString().slice(0, 10)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const resendKey = process.env.RESEND_API_KEY ?? ''
  const fromDomain = process.env.RESEND_FROM_DOMAIN ?? ''

  // Fetch due recurring invoices
  const { data: dueRecurring, error: fetchErr } = await supabaseAdmin
    .from('recurring_invoices')
    .select('id, business_id, base_invoice_id, frequency, next_due_date')
    .eq('is_active', true)
    .lte('next_due_date', today)
    .limit(100)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const processed: Array<{ id: string; status: string; newInvoiceId?: string }> = []

  for (const rec of dueRecurring ?? []) {
    try {
      // Fetch base invoice
      const { data: baseInv } = await supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('id', rec.base_invoice_id)
        .maybeSingle()
      if (!baseInv) { processed.push({ id: rec.id, status: 'skipped_no_base' }); continue }

      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('id, name, abn, address, phone')
        .eq('id', rec.business_id)
        .maybeSingle()
      if (!biz) { processed.push({ id: rec.id, status: 'skipped_no_biz' }); continue }

      // Fetch base line items
      const { data: baseLines } = await supabaseAdmin
        .from('invoice_line_items')
        .select('description, quantity, unit_price, gst_applicable, line_subtotal, line_gst, line_total, position')
        .eq('invoice_id', rec.base_invoice_id)
        .order('position')

      // Get next invoice number
      const { data: settings } = await supabaseAdmin
        .from('invoice_settings').select('*').eq('business_id', rec.business_id).maybeSingle()
      const prefix = settings?.invoice_prefix ?? 'INV-'
      const seq = settings?.next_invoice_seq ?? 1
      const invoice_number = prefix + String(seq).padStart(4, '0')
      await supabaseAdmin.from('invoice_settings').upsert(
        { business_id: rec.business_id, next_invoice_seq: seq + 1 },
        { onConflict: 'business_id' },
      )

      // Compute new due_date: same offset from today
      const baseDueDateOffset = baseInv.due_date && baseInv.issue_date
        ? Math.round((new Date(baseInv.due_date as string).getTime() - new Date(baseInv.issue_date as string).getTime()) / 86400000)
        : 30
      const newIssueDateStr = today
      const newDueDateStr = new Date(Date.now() + baseDueDateOffset * 86400000).toISOString().slice(0, 10)

      const signatureToken = crypto.randomUUID()

      // Clone invoice
      const { data: newInv, error: insertErr } = await supabaseAdmin.from('invoices').insert({
        business_id: rec.business_id,
        customer_id: baseInv.customer_id ?? null,
        invoice_number,
        status: 'sent',
        bill_to_name: baseInv.bill_to_name,
        bill_to_email: baseInv.bill_to_email ?? null,
        bill_to_address: baseInv.bill_to_address ?? null,
        notes: baseInv.notes ?? null,
        issue_date: newIssueDateStr,
        due_date: newDueDateStr,
        subtotal: baseInv.subtotal,
        gst_total: baseInv.gst_total,
        total: baseInv.total,
        currency: baseInv.currency ?? 'AUD',
        send_method: 'email',
        sent_at: new Date().toISOString(),
        auto_reminders: true,
        ai_generated: false,
        signature_token: signatureToken,
      }).select('id').single()

      if (insertErr || !newInv) {
        processed.push({ id: rec.id, status: 'error_insert: ' + (insertErr?.message ?? 'no row') })
        continue
      }

      // Clone line items
      if (baseLines?.length) {
        await supabaseAdmin.from('invoice_line_items').insert(
          baseLines.map(l => ({ ...l, invoice_id: newInv.id, business_id: rec.business_id }))
        )
      }

      // Send email if configured
      if (resendKey && baseInv.bill_to_email) {
        const publicUrl = `${appUrl}/invoice/${newInv.id}`
        const from = fromDomain
          ? `${biz.name} <invoices@${fromDomain}>`
          : `${biz.name} <onboarding@resend.dev>`
        const html = buildRecurringInvoiceHtml(biz, { ...baseInv, invoice_number, issue_date: newIssueDateStr, due_date: newDueDateStr }, baseLines ?? [], invoice_number, publicUrl)
        await sendInvoiceEmail(resendKey, from, baseInv.bill_to_email as string,
          `Recurring invoice ${invoice_number} from ${biz.name} — $${(Number(baseInv.total) || 0).toFixed(2)} AUD`, html)
      }

      // Advance next_due_date
      const nextDue = calcNextDueDate(rec.frequency ?? 'monthly', rec.next_due_date as string)
      await supabaseAdmin.from('recurring_invoices')
        .update({ next_due_date: nextDue })
        .eq('id', rec.id)

      processed.push({ id: rec.id, status: 'ok', newInvoiceId: newInv.id })
    } catch (err) {
      processed.push({ id: rec.id, status: 'exception: ' + (err instanceof Error ? err.message : String(err)) })
    }
  }

  return NextResponse.json({ ok: true, processed_count: processed.length, processed })
}

export const GET = withErrorCapture('cron/invoices-recurring', _GET)
