export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

function buildWholesaleInvoiceHtml(
  biz: { name: string; abn?: string | null; address?: string | null; phone?: string | null; logo_url?: string | null },
  inv: Record<string, unknown>,
  order: Record<string, unknown>,
  customer: Record<string, unknown> | null,
  items: Record<string, unknown>[],
): string {
  const issueDate = inv.issue_date ? new Date(inv.issue_date as string).toLocaleDateString('en-AU') : ''
  const dueDate = inv.due_date ? new Date(inv.due_date as string).toLocaleDateString('en-AU') : ''
  const subtotal = (Number(order.subtotal) || 0).toFixed(2)
  const discountTotal = (Number(order.discount_total) || 0).toFixed(2)
  const freight = (Number(order.freight) || 0).toFixed(2)
  const gstTotal = (Number(order.gst_total) || 0).toFixed(2)
  const total = (Number(order.total) || 0).toFixed(2)
  const bizInitial = (biz.name || 'A').charAt(0).toUpperCase()

  const itemRows = items.map(i => {
    const discPct = Number(i.discount_pct) || 0
    return '<tr>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;">' +
        (i.sku ? '<span style="font-family:monospace;font-size:11px;color:#666;margin-right:6px;">' + i.sku + '</span>' : '') +
        (i.name as string) +
        (i.description ? '<br><span style="font-size:11px;color:#888;">' + i.description + '</span>' : '') +
      '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;text-align:center;">' + (i.quantity as number) + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;text-align:right;">$' + (Number(i.retail_price) || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;text-align:right;">$' + (Number(i.unit_price) || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;text-align:center;">' + (discPct > 0 ? discPct.toFixed(0) + '%' : '—') + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #e8f0eb;font-size:13px;text-align:right;">$' + (Number(i.line_total) || 0).toFixed(2) + '</td>' +
    '</tr>'
  }).join('')

  const shippingAddress = (customer?.shipping_address as string | null) || (order.delivery_address as string | null) || '—'
  const billingAddress = (customer?.billing_address as string | null) || shippingAddress

  return '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'<meta charset="utf-8">' +
'<title>Tax Invoice ' + (inv.invoice_number as string) + '</title>' +
'<style>' +
'* { box-sizing: border-box; margin: 0; padding: 0; }' +
'body { font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a; background: #fff; }' +
'.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #2D5240; padding-bottom: 20px; }' +
'.logo-circle { width: 56px; height: 56px; border-radius: 50%; background: #2D5240; color: #7FB897; font-size: 26px; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }' +
'.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px; }' +
'.grid-cell { background: #f5faf7; border-radius: 6px; padding: 14px; }' +
'.grid-cell-title { font-size: 10px; font-weight: 700; color: #2D5240; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }' +
'.grid-cell p { font-size: 12px; color: #444; margin-bottom: 2px; }' +
'table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }' +
'thead tr { background: #2D5240; color: #fff; }' +
'th, td { padding: 10px 12px; }' +
'th { font-size: 12px; }' +
'.totals { margin-left: auto; width: 280px; border: 1px solid #e8f0eb; border-radius: 8px; padding: 16px; }' +
'.tot-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: #555; }' +
'.tot-grand { display: flex; justify-content: space-between; padding: 10px 0 0 0; font-size: 16px; font-weight: 700; border-top: 2px solid #2D5240; margin-top: 8px; }' +
'.payment-block { margin-top: 24px; background: #f5faf7; border-radius: 8px; padding: 20px; }' +
'.payment-title { font-size: 13px; font-weight: 700; color: #2D5240; margin-bottom: 12px; }' +
'.footer { margin-top: 28px; font-size: 10px; color: #999; text-align: center; border-top: 1px solid #e8e8e8; padding-top: 12px; }' +
'</style>' +
'</head>' +
'<body>' +
'<div class="header">' +
'<div>' +
'<div class="logo-circle">' + bizInitial + '</div>' +
'<h1 style="font-size:22px;font-weight:700;color:#2D5240;margin-bottom:4px;">TAX INVOICE</h1>' +
'<p style="font-size:16px;font-weight:600;">' + biz.name + '</p>' +
(biz.abn ? '<p style="font-size:12px;color:#666;margin-top:2px;">ABN: ' + biz.abn + '</p>' : '') +
(biz.address ? '<p style="font-size:12px;color:#666;">' + biz.address + '</p>' : '') +
(biz.phone ? '<p style="font-size:12px;color:#666;">' + biz.phone + '</p>' : '') +
'</div>' +
'<div style="text-align:right;">' +
'<p style="font-size:22px;font-weight:700;color:#2D5240;font-family:monospace;">' + (inv.invoice_number as string) + '</p>' +
'<p style="font-size:12px;color:#666;margin-top:4px;">Order: ' + (order.order_number as string) + '</p>' +
'<p style="font-size:12px;color:#666;">Issue date: ' + issueDate + '</p>' +
(dueDate ? '<p style="font-size:12px;color:#ef4444;font-weight:600;">Due: ' + dueDate + '</p>' : '') +
'</div>' +
'</div>' +

'<div class="grid-3">' +
'<div class="grid-cell">' +
'<div class="grid-cell-title">Bill To</div>' +
(customer?.business_name ? '<p style="font-weight:600;">' + (customer.business_name as string) + '</p>' : '') +
(customer?.name ? '<p>' + (customer.name as string) + '</p>' : '') +
(customer?.email ? '<p>' + (customer.email as string) + '</p>' : '') +
(billingAddress !== '—' ? '<p style="margin-top:4px;">' + billingAddress + '</p>' : '') +
'</div>' +
'<div class="grid-cell">' +
'<div class="grid-cell-title">Ship To</div>' +
'<p>' + shippingAddress + '</p>' +
(order.delivery_notes ? '<p style="margin-top:4px;font-style:italic;">' + (order.delivery_notes as string) + '</p>' : '') +
'</div>' +
'<div class="grid-cell">' +
'<div class="grid-cell-title">Order Details</div>' +
'<p><strong>Terms:</strong> ' + (order.payment_terms as string || 'Net 14') + '</p>' +
(order.po_ref ? '<p><strong>PO Ref:</strong> ' + (order.po_ref as string) + '</p>' : '') +
(order.delivery_date ? '<p><strong>Delivery:</strong> ' + new Date(order.delivery_date as string).toLocaleDateString('en-AU') + '</p>' : '') +
(customer?.abn ? '<p><strong>ABN:</strong> ' + (customer.abn as string) + '</p>' : '') +
'</div>' +
'</div>' +

'<table>' +
'<thead><tr>' +
'<th style="text-align:left;">Product</th>' +
'<th style="text-align:center;">Qty</th>' +
'<th style="text-align:right;">RRP</th>' +
'<th style="text-align:right;">Wholesale</th>' +
'<th style="text-align:center;">Disc</th>' +
'<th style="text-align:right;">Line Total</th>' +
'</tr></thead>' +
'<tbody>' + itemRows + '</tbody>' +
'</table>' +

'<div style="display:flex;justify-content:flex-end;">' +
'<div class="totals">' +
'<div class="tot-row"><span>Subtotal</span><span>$' + subtotal + '</span></div>' +
(Number(discountTotal) > 0 ? '<div class="tot-row" style="color:#2D5240;"><span>Customer Discount</span><span>−$' + discountTotal + '</span></div>' : '') +
(Number(freight) > 0 ? '<div class="tot-row"><span>Freight</span><span>$' + freight + '</span></div>' : '') +
'<div class="tot-row"><span>GST (10%)</span><span>$' + gstTotal + '</span></div>' +
'<div class="tot-grand"><span>Total AUD</span><span>$' + total + '</span></div>' +
'</div>' +
'</div>' +

'<div class="payment-block">' +
'<div class="payment-title">Payment Information</div>' +
'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
'<div><p style="font-size:12px;font-weight:600;margin-bottom:6px;">Bank Transfer</p><p style="font-size:12px;color:#555;">Please reference invoice number ' + (inv.invoice_number as string) + ' when paying.</p></div>' +
'<div><p style="font-size:12px;font-weight:600;margin-bottom:6px;">Terms</p><p style="font-size:12px;color:#555;">' + (order.payment_terms as string || 'Net 14') + '. Payment due by ' + dueDate + '.</p></div>' +
'</div>' +
(order.notes ? '<p style="font-size:12px;color:#555;margin-top:12px;border-top:1px solid #ddd;padding-top:10px;"><strong>Notes:</strong> ' + (order.notes as string) + '</p>' : '') +
'</div>' +

'<p class="footer">This is a tax invoice for GST purposes. ' + biz.name + ' ABN: ' + (biz.abn ?? 'N/A') + ' — Generated by Aria OS</p>' +
'</body></html>'
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
      status: 'completed',
      payload: { order_id: params.id, invoice_id: (inv as { id: string }).id },
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ invoice_id: (inv as { id: string }).id, pdf_url: pdfUrl })
}

export const POST = withErrorCapture('wholesale/orders/[id]/generate-invoice', _POST)
