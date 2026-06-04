export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

function buildWholesaleInvoiceHtml(
  biz: { name: string; abn?: string | null; address?: string | null; phone?: string | null; email?: string | null; website?: string | null; logo_url?: string | null },
  inv: Record<string, unknown>,
  order: Record<string, unknown>,
  customer: Record<string, unknown> | null,
  items: Record<string, unknown>[],
): string {
  const issueDate = inv.issue_date ? new Date(inv.issue_date as string).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  const dueDate = inv.due_date ? new Date(inv.due_date as string).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  const subtotal = (Number(order.subtotal) || 0).toFixed(2)
  const discountTotal = (Number(order.discount_total) || 0).toFixed(2)
  const freight = (Number(order.freight) || 0).toFixed(2)
  const gstTotal = (Number(order.gst_total) || 0).toFixed(2)
  const total = (Number(order.total) || 0).toFixed(2)
  const bizInitial = (biz.name || 'A').charAt(0).toUpperCase()
  const shippingAddress = (customer?.shipping_address as string | null) || (order.delivery_address as string | null) || '—'
  const billingAddress = (customer?.billing_address as string | null) || shippingAddress

  const itemRows = items.map(i => {
    const discPct = Number(i.discount_pct) || 0
    const lineTotal = (Number(i.line_total) || 0).toFixed(2)
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eef2ee;font-size:11px;color:#888;font-family:monospace;">${i.sku || '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eef2ee;">
        <span style="font-size:13px;font-weight:500;">${i.name as string}</span>
        ${i.description ? `<div style="font-size:11px;color:#888;margin-top:2px;">${i.description as string}</div>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #eef2ee;text-align:right;font-size:13px;">${i.quantity as number}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eef2ee;text-align:right;font-size:13px;">$${(Number(i.unit_price) || 0).toFixed(2)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eef2ee;text-align:right;font-size:13px;color:${discPct > 0 ? '#166534' : '#888'};">${discPct > 0 ? discPct.toFixed(0) + '%' : '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eef2ee;text-align:right;font-size:13px;font-weight:500;">$${lineTotal}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tax Invoice ${inv.invoice_number as string}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; padding: 40px 44px; color: #111; background: #fff; font-size: 13px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
.biz-logo { width: 48px; height: 48px; border-radius: 10px; background: #2D5240; color: #7FB897; font-size: 22px; font-weight: 600; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; font-style: italic; }
.biz-name { font-size: 17px; font-weight: 600; margin-bottom: 3px; }
.biz-meta { font-size: 11px; color: #666; line-height: 1.7; }
.inv-number { font-size: 19px; font-weight: 600; text-align: right; margin-bottom: 6px; }
.inv-badge { display: inline-block; font-size: 11px; padding: 3px 10px; border-radius: 99px; background: #fef9c3; color: #854d0e; font-weight: 500; }
.divider { height: 1px; background: #e5e7eb; margin: 20px 0; }
.meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 24px; }
.meta-cell-label { font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 7px; }
.meta-cell p { font-size: 12px; color: #444; line-height: 1.65; }
.meta-cell strong { color: #111; font-weight: 500; }
table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
thead tr { background: #f8faf8; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
th { font-size: 10px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 12px; }
.bottom-block { display: flex; justify-content: space-between; gap: 32px; padding-top: 8px; }
.notes-block { flex: 1; font-size: 12px; color: #555; line-height: 1.6; }
.notes-label { font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 7px; }
.totals-block { width: 240px; font-size: 12px; }
.tot-row { display: flex; justify-content: space-between; padding: 4px 0; color: #555; }
.tot-row.discount { color: #166534; }
.tot-grand { display: flex; justify-content: space-between; padding: 9px 0 0; font-size: 14px; font-weight: 600; border-top: 1px solid #e5e7eb; margin-top: 8px; }
.amount-due { display: flex; justify-content: space-between; padding: 6px 10px; margin-top: 10px; background: #fef9c3; border-radius: 6px; }
.amount-due span { font-size: 13px; font-weight: 600; color: #854d0e; }
.payment-block { margin-top: 28px; background: #f8faf8; border-radius: 8px; padding: 18px 20px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
.pay-label { font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 7px; }
.pay-val { font-size: 11px; color: #444; line-height: 1.7; font-family: monospace; }
.footer { margin-top: 24px; font-size: 10px; color: #aaa; display: flex; justify-content: space-between; border-top: 1px solid #e5e7eb; padding-top: 12px; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div>
    <div class="biz-logo">${bizInitial}</div>
    <div class="biz-name">${biz.name}</div>
    <div class="biz-meta">
      ${biz.abn ? `ABN ${biz.abn}` : ''}${biz.abn && biz.address ? ' · ' : ''}${biz.address || ''}<br>
      ${[biz.email, biz.phone, biz.website].filter(Boolean).join(' · ')}
    </div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Tax invoice</div>
    <div class="inv-number">${inv.invoice_number as string}</div>
    <span class="inv-badge">Awaiting payment</span>
  </div>
</div>

<div class="divider"></div>

<!-- Bill to / Ship to / Details -->
<div class="meta-grid">
  <div class="meta-cell">
    <div class="meta-cell-label">Bill to</div>
    ${customer?.business_name ? `<p><strong>${customer.business_name as string}</strong></p>` : ''}
    ${customer?.abn ? `<p>ABN ${customer.abn as string}</p>` : ''}
    ${customer?.name ? `<p>Attn: ${customer.name as string}</p>` : ''}
    ${billingAddress !== '—' ? `<p>${billingAddress}</p>` : ''}
    ${customer?.email ? `<p>${customer.email as string}</p>` : ''}
  </div>
  <div class="meta-cell">
    <div class="meta-cell-label">Ship to</div>
    <p>${shippingAddress}</p>
    ${order.delivery_notes ? `<p style="margin-top:4px;font-style:italic;">${order.delivery_notes as string}</p>` : ''}
  </div>
  <div class="meta-cell">
    <div class="meta-cell-label">Details</div>
    <table style="width:100%;margin:0;border:none;">
      <tr><td style="padding:2px 0;color:#888;font-size:11px;border:none;">Issued</td><td style="padding:2px 0;text-align:right;font-size:11px;border:none;">${issueDate}</td></tr>
      <tr><td style="padding:2px 0;color:#888;font-size:11px;border:none;">Due</td><td style="padding:2px 0;text-align:right;font-size:11px;font-weight:600;border:none;">${dueDate}</td></tr>
      <tr><td style="padding:2px 0;color:#888;font-size:11px;border:none;">Terms</td><td style="padding:2px 0;text-align:right;font-size:11px;border:none;">${order.payment_terms as string || 'Net 14'}</td></tr>
      ${order.po_ref ? `<tr><td style="padding:2px 0;color:#888;font-size:11px;border:none;">PO ref</td><td style="padding:2px 0;text-align:right;font-size:11px;border:none;">${order.po_ref as string}</td></tr>` : ''}
      <tr><td style="padding:2px 0;color:#888;font-size:11px;border:none;">Order ID</td><td style="padding:2px 0;text-align:right;font-size:11px;border:none;">${order.order_number as string}</td></tr>
    </table>
  </div>
</div>

<!-- Line items -->
<table>
  <thead>
    <tr>
      <th style="text-align:left;width:72px;">SKU</th>
      <th style="text-align:left;">Description</th>
      <th style="text-align:right;width:40px;">Qty</th>
      <th style="text-align:right;width:80px;">Unit price</th>
      <th style="text-align:right;width:50px;">Disc.</th>
      <th style="text-align:right;width:80px;">Line total</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>

<!-- Notes + Totals -->
<div class="bottom-block">
  <div class="notes-block">
    <div class="notes-label">Notes</div>
    <p>${order.notes as string || 'Thank you for your order.'}</p>
  </div>
  <div class="totals-block">
    <div class="tot-row"><span>Subtotal (excl. GST)</span><span>$${subtotal}</span></div>
    ${Number(discountTotal) > 0 ? `<div class="tot-row discount"><span>Discount</span><span>−$${discountTotal}</span></div>` : ''}
    ${Number(freight) > 0 ? `<div class="tot-row"><span>Freight</span><span>$${freight}</span></div>` : `<div class="tot-row"><span>Freight</span><span>$0.00</span></div>`}
    <div class="tot-row"><span>GST (10%)</span><span>$${gstTotal}</span></div>
    <div class="tot-grand"><span>Total inc. GST</span><span>$${total}</span></div>
    <div class="amount-due"><span>Amount due</span><span>$${total}</span></div>
  </div>
</div>

<!-- Payment block -->
<div class="payment-block">
  <div>
    <div class="pay-label">Bank transfer</div>
    <div class="pay-val">Reference: ${inv.invoice_number as string}<br>Due by: ${dueDate}</div>
  </div>
  <div>
    <div class="pay-label">Pay online</div>
    <div class="pay-val" style="font-family:sans-serif;">Card or PayID — secure link sent via email with this invoice.</div>
  </div>
  <div>
    <div class="pay-label">Terms</div>
    <div class="pay-val" style="font-family:sans-serif;">${order.payment_terms as string || 'Net 14'}. 2% late fee per month after due date. Goods remain ${biz.name}\'s property until paid in full.</div>
  </div>
</div>

<div class="footer">
  <span>Thank you for your order — questions: ${biz.email || 'hello@' + biz.name.toLowerCase().replace(/\s+/g, '') + '.com'}</span>
  <span>Generated by Aria · ariaos.site</span>
</div>

</body>
</html>`
}


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

  // Fetch items
  const { data: items } = await supabaseAdmin
    .from('wholesale_order_items')
    .select('*')
    .eq('order_id', params.id)
    .order('position')

  // Fetch customer
  let customer: Record<string, unknown> | null = null
  if (order.customer_id) {
    const { data: c } = await supabaseAdmin
      .from('customers')
      .select('id, name, email, business_name, abn, billing_address, shipping_address')
      .eq('id', order.customer_id)
      .maybeSingle()
    customer = c
  }

  // Fetch business
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, abn, address, phone, logo_url')
    .eq('id', order.business_id)
    .single()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Generate invoice number
  const { data: settings } = await supabaseAdmin
    .from('invoice_settings').select('*').eq('business_id', order.business_id).maybeSingle()
  const prefix = settings?.invoice_prefix ?? 'INV-'
  const seq = settings?.next_invoice_seq ?? 1
  const invoice_number = prefix + String(seq).padStart(4, '0')

  await supabaseAdmin.from('invoice_settings').upsert(
    { business_id: order.business_id, next_invoice_seq: seq + 1 },
    { onConflict: 'business_id' },
  )

  const today = new Date().toISOString().slice(0, 10)
  const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)

  // Insert invoice
  const { data: inv, error: invErr } = await supabaseAdmin.from('invoices').insert({
    business_id: order.business_id,
    customer_id: order.customer_id ?? null,
    invoice_number,
    status: 'draft',
    bill_to_name: (customer?.business_name as string) || (customer?.name as string) || 'Wholesale Customer',
    bill_to_email: (customer?.email as string | null) ?? null,
    bill_to_address: (customer?.billing_address as string | null) ?? (order.delivery_address as string | null) ?? null,
    notes: order.notes ?? null,
    issue_date: today,
    due_date: dueDate,
    subtotal: order.subtotal,
    gst_total: order.gst_total,
    total: order.total,
    currency: 'AUD',
    ai_generated: false,
  }).select('*').single()

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  // Insert invoice line items
  const lineRows = (items ?? []).map((item: Record<string, unknown>, idx: number) => ({
    invoice_id: (inv as { id: string }).id,
    business_id: order.business_id,
    description: (item.name as string) + (item.description ? ' — ' + item.description : ''),
    quantity: item.quantity,
    unit_price: item.unit_price,
    gst_applicable: true,
    line_subtotal: item.line_total,
    line_gst: item.gst_amount,
    line_total: (Number(item.line_total) || 0) + (Number(item.gst_amount) || 0),
    position: idx,
  }))
  await supabaseAdmin.from('invoice_line_items').insert(lineRows)

  // Build and upload PDF
  const invoiceRecord = inv as Record<string, unknown>
  const html = buildWholesaleInvoiceHtml(biz, { ...invoiceRecord, invoice_number }, order, customer, items ?? [])

  let pdfUrl: string | null = null
  try {
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteer = (await import('puppeteer-core')).default
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: { width: 1200, height: 1600 },
    })
    let pdfBuffer: Buffer
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' as never })
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' } })
      pdfBuffer = Buffer.from(pdf)
    } finally {
      await browser.close()
    }
    const blob = await put(
      'invoices/' + order.business_id + '/' + (inv as { id: string }).id + '.pdf',
      pdfBuffer,
      { access: 'public', contentType: 'application/pdf' },
    )
    pdfUrl = blob.url
  } catch {
    // Fall back to HTML blob
    try {
      const blob = await put(
        'invoices/' + order.business_id + '/' + (inv as { id: string }).id + '.html',
        html,
        { access: 'public', contentType: 'text/html' },
      )
      pdfUrl = blob.url
    } catch { /* non-fatal */ }
  }

  // Update invoice with pdf_url
  if (pdfUrl) {
    await supabaseAdmin.from('invoices').update({ pdf_url: pdfUrl }).eq('id', (inv as { id: string }).id)
  }

  // Update wholesale order
  await supabaseAdmin.from('wholesale_orders').update({
    invoice_id: (inv as { id: string }).id,
    status: 'invoiced',
  }).eq('id', params.id)

  // Log to aria_autopilot_actions
  try {
    await supabaseAdmin.from('aria_autopilot_actions').insert({
      action_type: 'wholesale_invoice_generated',
      business_id: order.business_id,
      status: 'executed',
      action_data: { order_id: params.id, invoice_id: (inv as { id: string }).id },
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ invoice_id: (inv as { id: string }).id, pdf_url: pdfUrl })
}

export const POST = withErrorCapture('wholesale/orders/[id]/generate-invoice', _POST)
