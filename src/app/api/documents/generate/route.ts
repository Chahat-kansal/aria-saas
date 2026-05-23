export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const DOC_PROMPTS: Record<string, string> = {
  payslip: `Create a PAYSLIP. Professional, clean design. Must include:
- Business header with logo area, name, ABN
- Employee details: name, position, employment type
- Pay period clearly shown
- Earnings table: hours, rate, gross pay
- Deductions: PAYG tax (red), superannuation (blue)
- Net pay prominently in a highlighted box
- YTD figures section
- Footer with ATO compliance note
Style: white background, #2D5240 dark green accent, Inter font, clean like Xero payslips`,

  sales_report: `Create a DAILY SALES REPORT. Modern data-rich design. Must include:
- Date prominently at top
- Hero metrics: total revenue, transactions, average sale
- Revenue by payment method with visual CSS bars
- Top 10 products table with quantity and revenue
- Hourly breakdown table
Style: dark header, white body, green for positive metrics`,

  end_of_day: `Create an END OF DAY REPORT. Clean summary. Must include:
- Business name and date
- Total sales by payment type
- Refunds and voids, net revenue
- Staff who worked
Style: professional, printable, simple two-column layout`,

  purchase_order: `Create a PURCHASE ORDER. Formal business document. Must include:
- PO number and date prominently, "PURCHASE ORDER" header
- From (business) and To (supplier) address blocks
- Items table: description, qty, unit cost, total
- Subtotal, GST (10%), total
- Authorised by signature line
Style: formal, black and white printable, table borders`,

  stock_report: `Create a STOCK REPORT. Data table focused. Must include:
- Report date, summary stats: total SKUs, low stock count, total value
- Low stock alerts section highlighted
- Full stock table: product, current stock, reorder point, value
- Color coding: red out of stock, amber low, green healthy
Style: clean data table, print-optimised`,

  invoice: `Create an INVOICE. Professional business invoice. Must include:
- "INVOICE" header large, invoice number, date, due date
- From business and To customer address blocks
- Line items: description, qty, unit price, total
- Subtotal, GST (10%), total due prominently
- Payment details, thank you note
Style: clean, professional, suitable for sending to customers`,
}

function dollar(cents: number) { return (cents / 100).toFixed(2) }
function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) }
  catch { return d }
}

function hydratePayslip(template: string, run: Record<string, unknown>, lines: Record<string, unknown>[], biz: { name: string; abn: string | null }): string {
  const styleMatch = template.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
  const linkTags = template.match(/<link[^>]+>/gi) ?? []
  let pages = ''

  for (const line of lines) {
    let pg = template
    const vars: Record<string, string> = {
      business_name: biz.name,
      business_abn: biz.abn ?? 'Not registered',
      employee_name: String(line.staff_name ?? ''),
      position: String(line.position ?? 'Staff'),
      employment_type: String(line.employment_type ?? ''),
      pay_frequency: String(line.pay_frequency ?? 'weekly'),
      hours_worked: Number(line.hours_worked ?? 0).toFixed(2),
      hourly_rate: dollar(Number(line.hourly_rate_cents ?? 0)),
      gross_pay: dollar(Number(line.gross_pay_cents ?? 0)),
      tax_withheld: dollar(Number(line.tax_withheld_cents ?? 0)),
      super_rate: String(line.superannuation_rate ?? 11.5),
      super_amount: dollar(Number(line.super_cents ?? 0)),
      net_pay: dollar(Number(line.net_pay_cents ?? 0)),
      ytd_gross: dollar(Number(line.ytd_gross_cents ?? 0)),
      ytd_tax: dollar(Math.round(Number(line.ytd_gross_cents ?? 0) * Number(line.tax_withheld_cents ?? 0) / Math.max(Number(line.gross_pay_cents ?? 1), 1))),
      ytd_super: dollar(Math.round(Number(line.ytd_gross_cents ?? 0) * Number(line.superannuation_rate ?? 11.5) / 100)),
      period_start: fmtDate(String(run.period_start ?? '')),
      period_end: fmtDate(String(run.period_end ?? '')),
    }
    for (const [k, v] of Object.entries(vars)) {
      pg = pg.replace(new RegExp('{{' + k + '}}', 'g'), v)
    }
    const bodyMatch = pg.match(/<body[^>]*>([\s\S]*)<\/body>/i)
    pages += '<div style="page-break-after:always">' + (bodyMatch?.[1] ?? pg) + '</div>'
  }

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    linkTags.join('') +
    '<style>' + (styleMatch?.[1] ?? '') + '</style>' +
    '</head><body>' + pages + '</body></html>'
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    type: string
    data: Record<string, unknown>
    business_id: string
    regenerate?: boolean
    style_preferences?: string
  }
  const { type, data, business_id, regenerate, style_preferences } = body
  if (!type || !business_id) return NextResponse.json({ error: 'type and business_id required' }, { status: 400 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('name, abn, industry, city')
    .eq('id', business_id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Fast payslip hydration using seeded global template — no Claude needed
  if (type === 'payslip' && !regenerate && data.run) {
    const { data: tmpl } = await supabaseAdmin
      .from('document_templates').select('html_template')
      .eq('is_global', true).eq('type', 'payslip').maybeSingle()

    if (tmpl?.html_template) {
      const run = data.run as Record<string, unknown>
      const lines = (data.lines ?? []) as Record<string, unknown>[]
      const html = hydratePayslip(tmpl.html_template, run, lines, biz)
      return NextResponse.json({ html, source: 'global_template' })
    }
  }

  // Check for existing business-specific cached template
  if (!regenerate) {
    const { data: existing } = await supabaseAdmin
      .from('document_templates').select('html_template')
      .eq('business_id', business_id).eq('type', type).eq('is_default', true).maybeSingle()
    if (existing?.html_template) {
      return NextResponse.json({ html: existing.html_template, source: 'template' })
    }

    const { data: global } = await supabaseAdmin
      .from('document_templates').select('html_template')
      .eq('is_global', true).eq('type', type).maybeSingle()
    if (global?.html_template) {
      return NextResponse.json({ html: global.html_template, source: 'global_template' })
    }
  }

  // Generate with Claude Sonnet
  const docPrompt = DOC_PROMPTS[type] ?? ('Create a professional ' + type + ' document')
  const dataStr = JSON.stringify(data, null, 2).slice(0, 4000)

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4000,
    system: `You are an expert HTML/CSS document designer. Generate beautiful, print-ready HTML documents.
Return ONLY the complete HTML document — no markdown, no explanation.
Use a single <style> block with @media print CSS. Use Google Fonts via <link> tag.
Self-contained — all CSS in <style> tag. No external JS dependencies.
Must look as professional as Xero or MYOB documents.
Use the actual data provided — never use placeholder values.
Brand color: #2D5240 (dark green).`,
    messages: [{
      role: 'user',
      content: docPrompt + '\n\nBusiness: ' + biz.name + (biz.abn ? ' (ABN: ' + biz.abn + ')' : '') +
        '\nIndustry: ' + (biz.industry ?? 'retail') +
        (style_preferences ? '\nStyle: ' + style_preferences : '') +
        '\n\nDATA:\n' + dataStr +
        '\n\nGenerate the complete HTML document now using this exact data.',
    }],
  })

  let html = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  html = html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }

  // Cache for this business
  await supabaseAdmin.from('document_templates').upsert({
    business_id, type,
    name: biz.name + ' ' + type,
    html_template: html,
    is_default: true,
    created_by: 'aria',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,type,is_default' }).then(undefined, () => {})

  return NextResponse.json({ html, source: 'generated' })
}

export const POST = withErrorCapture('documents/generate', _POST)
