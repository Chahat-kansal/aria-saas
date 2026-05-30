export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

function buildPdfHtml(
  biz: { name: string; abn?: string | null; address?: string | null; phone?: string | null; logo_url?: string | null },
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
<head>
  <meta charset="utf-8">
  <title>Tax Invoice ${inv.invoice_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; }
    .logo { max-height: 64px; max-width: 180px; object-fit: contain; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #2D5240; color: #fff; }
    th, td { padding: 10px 12px; }
    th { font-size: 13px; }
    .bill-to { background: #f5faf7; border-radius: 6px; padding: 16px; margin-bottom: 24px; }
    .totals { margin-left: auto; width: 260px; }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #555; }
    .totals .grand { display: flex; justify-content: space-between; padding: 10px 0; font-size: 16px; font-weight: 700; border-top: 2px solid #2D5240; margin-top: 6px; }
    .footer { margin-top: 32px; font-size: 11px; color: #999; text-align: center; }
    .notes { margin-top: 24px; font-size: 13px; color: #555; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${biz.logo_url ? `<img class="logo" src="${biz.logo_url}" alt="${biz.name} logo">` : ''}
      <h1 style="font-size:24px;font-weight:700;color:#2D5240;margin:0 0 4px;">TAX INVOICE</h1>
      <p style="font-size:18px;font-weight:600;">${biz.name}</p>
      ${biz.abn ? `<p style="margin:2px 0;font-size:13px;color:#555;">ABN: ${biz.abn}</p>` : ''}
      ${biz.address ? `<p style="margin:2px 0;font-size:13px;color:#555;">${biz.address}</p>` : ''}
      ${biz.phone ? `<p style="margin:2px 0;font-size:13px;color:#555;">${biz.phone}</p>` : ''}
    </div>
    <div style="text-align:right;">
      <p style="font-size:15px;font-weight:600;color:#2D5240;">${inv.invoice_number}</p>
      <p style="margin:2px 0;font-size:13px;color:#555;">Issue date: ${issueDate}</p>
      ${dueDate ? `<p style="margin:2px 0;font-size:13px;color:#555;">Due date: ${dueDate}</p>` : ''}
    </div>
  </div>

  <div class="bill-to">
    <p style="font-size:13px;color:#555;">Bill to:</p>
    <p style="margin:4px 0;font-size:15px;font-weight:600;">${inv.bill_to_name}</p>
    ${inv.bill_to_email ? `<p style="margin:2px 0;font-size:13px;color:#555;">${inv.bill_to_email}</p>` : ''}
    ${inv.bill_to_address ? `<p style="margin:2px 0;font-size:13px;color:#555;">${inv.bill_to_address}</p>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left;">Description</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Unit Price</th>
        <th style="text-align:center;">GST</th>
        <th style="text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal (ex-GST)</span><span>$${subtotal}</span></div>
    <div class="row"><span>GST (10%)</span><span>$${gstTotal}</span></div>
    <div class="grand"><span>Total (AUD)</span><span>$${total}</span></div>
  </div>

  ${inv.notes ? `<p class="notes"><strong>Notes:</strong> ${inv.notes}</p>` : ''}
  <p class="footer">This is a tax invoice for GST purposes. ABN: ${biz.abn ?? 'N/A'} &mdash; Generated by Aria OS</p>
</body>
</html>`
}

async function _POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: inv } = await supabaseAdmin.from('invoices').select('*').eq('id', params.id).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses')
    .select('id, name, abn, address, phone, logo_url').eq('id', inv.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: lineItems } = await supabaseAdmin
    .from('invoice_line_items').select('*').eq('invoice_id', params.id).order('position')

  const html = buildPdfHtml(biz, inv, lineItems ?? [])

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
    'invoices/' + inv.business_id + '/' + params.id + '.pdf',
    pdfBuffer,
    { access: 'public', contentType: 'application/pdf' },
  )

  await supabaseAdmin.from('invoices').update({
    pdf_url: blob.url,
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  return NextResponse.json({ pdf_url: blob.url })
}

export const POST = withErrorCapture('invoices/[id]/pdf', _POST)
