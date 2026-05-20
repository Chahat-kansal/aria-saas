export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// Document type definitions — tells Claude what each document looks like
const DOC_PROMPTS: Record<string, string> = {
  payslip: `Create a PAYSLIP. Professional, clean design. Must include:
- Business header with logo area, name, ABN, address
- Employee details: name, position, employment type
- Pay period clearly shown
- Earnings table: hours, rate, gross pay
- Deductions: PAYG tax (styled in red/orange), superannuation (styled in blue)
- Net pay prominently displayed in a highlighted box
- YTD figures section
- Footer with legal note about ATO compliance
Style: white background, the business brand color as accent, Inter/Arial font, very clean and professional like Xero payslips`,

  sales_report: `Create a DAILY SALES REPORT. Modern, data-rich design. Must include:
- Date prominently at top
- Hero metrics row: total revenue, transactions, average sale, top hour
- Revenue by payment method (cash, card, etc.) as a visual bar
- Top 10 products table with quantity and revenue
- Hourly breakdown table or visual
- Staff performance if data provided
- Comparison to yesterday/last week if available
Style: dark header, white body, green for positive metrics, charts simulated with CSS bars`,

  end_of_day: `Create an END OF DAY REPORT. Clean summary design. Must include:
- Business name and date
- Opening/closing float
- Total sales by payment type
- Refunds and voids
- Net revenue
- Staff who worked
- Any notes
Style: professional, printable, simple two-column layout`,

  purchase_order: `Create a PURCHASE ORDER. Formal business document. Must include:
- PO number and date prominently
- "PURCHASE ORDER" header
- From (business) and To (supplier) address blocks
- Delivery date requested
- Items table: SKU, description, qty, unit cost, total
- Subtotal, GST (10%), total
- Payment terms
- Authorised by signature line
- Terms and conditions footer
Style: formal business document, black and white printable, table borders`,

  stock_report: `Create a STOCK REPORT. Data table focused design. Must include:
- Report date and period
- Summary stats: total SKUs, low stock count, out of stock, total value
- Low stock alerts section (highlighted)
- Full stock table: product, category, current stock, reorder point, value
- Color coding: red for out of stock, amber for low, green for healthy
Style: clean data table, print-optimised`,

  invoice: `Create an INVOICE. Professional business invoice. Must include:
- "INVOICE" header large
- Invoice number, date, due date
- From business and To customer address blocks  
- Line items table: description, qty, unit price, total
- Subtotal, GST (10%), total due prominently
- Payment details (bank transfer, etc.)
- Due date highlighted
- Thank you note
Style: clean, professional, suitable for sending to customers`,
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

  // Get business branding
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name, abn, industry, city')
    .eq('id', business_id)
    .maybeSingle()

  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Check for existing template unless regenerating
  if (!regenerate) {
    const { data: existing } = await supabaseAdmin
      .from('document_templates')
      .select('html_template')
      .eq('business_id', business_id)
      .eq('type', type)
      .eq('is_default', true)
      .maybeSingle()

    if (existing?.html_template) {
      const rendered = renderTemplate(existing.html_template, data, biz)
      return NextResponse.json({ html: rendered, source: 'template' })
    }

    // Try global template
    const { data: global } = await supabaseAdmin
      .from('document_templates')
      .select('html_template')
      .eq('is_global', true)
      .eq('type', type)
      .maybeSingle()

    if (global?.html_template) {
      const rendered = renderTemplate(global.html_template, data, biz)
      return NextResponse.json({ html: rendered, source: 'global_template' })
    }
  }

  // For payslip type with a global template — hydrate directly without Claude
  if (type === 'payslip' && !regenerate) {
    const { data: tmpl } = await supabaseAdmin
      .from('document_templates')
      .select('html_template')
      .eq('is_global', true)
      .eq('type', 'payslip')
      .maybeSingle()

    if (tmpl?.html_template && data.run) {
      const run = data.run as Record<string, unknown>
      const lines = (data.lines as Array<Record<string, unknown>>) ?? []
      const $ = (c: number) => (c / 100).toFixed(2)
      const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

      // Generate one payslip page per staff member
      let allPages = ''
      for (const line of lines) {
        let page = tmpl.html_template
        const vars: Record<string, string> = {
          business_name: biz.name,
          business_abn: biz.abn ?? 'Not registered',
          employee_name: String(line.staff_name ?? ''),
          position: String(line.position ?? 'Staff'),
          employment_type: String(line.employment_type ?? ''),
          pay_frequency: String(line.pay_frequency ?? 'weekly'),
          hours_worked: Number(line.hours_worked ?? 0).toFixed(2),
          hourly_rate: $(Number(line.hourly_rate_cents ?? 0)),
          gross_pay: $(Number(line.gross_pay_cents ?? 0)),
          tax_withheld: $(Number(line.tax_withheld_cents ?? 0)),
          super_rate: String(line.superannuation_rate ?? 11.5),
          super_amount: $(Number(line.super_cents ?? 0)),
          net_pay: $(Number(line.net_pay_cents ?? 0)),
          ytd_gross: $(Number(line.ytd_gross_cents ?? 0)),
          ytd_tax: $(Math.round(Number(line.ytd_gross_cents ?? 0) * Number(line.tax_withheld_cents ?? 0) / Math.max(Number(line.gross_pay_cents ?? 1), 1))),
          ytd_super: $(Math.round(Number(line.ytd_gross_cents ?? 0) * Number(line.superannuation_rate ?? 11.5) / 100)),
          period_start: fmtDate(String(run.period_start ?? '')),
          period_end: fmtDate(String(run.period_end ?? '')),
        }
        for (const [k, v] of Object.entries(vars)) {
          page = page.replace(new RegExp(`{{${k}}}`, 'g'), v)
        }
        // Extract body content and wrap in print page break
        const bodyMatch = page.match(/<body[^>]*>([\s\S]*)<\/body>/i)
        allPages += `<div style="page-break-after:always">${bodyMatch?.[1] ?? page}</div>`
      }

      // Wrap all pages in one HTML document
      const firstPage = tmpl.html_template
      const styleMatch = firstPage.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
      const linkMatch = firstPage.match(/<link[^>]*>/gi)
      const fullHtml = \`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
\${linkMatch?.join('\n') ?? ''}
<style>\${styleMatch?.[1] ?? ''}</style>
</head>
<body>
\${allPages}
</body>
</html>\`

      return NextResponse.json({ html: fullHtml, source: 'global_template' })
    }
  }

  // Fast payslip hydration using seeded global template — no Claude needed
  if (type === 'payslip' && !regenerate && data.run) {
    const { data: tmpl } = await supabaseAdmin
      .from('document_templates').select('html_template')
      .eq('is_global', true).eq('type', 'payslip').maybeSingle()

    if (tmpl?.html_template) {
      const run = data.run as Record<string, unknown>
      const payLines = ((data.lines ?? []) as Array<Record<string, unknown>>)
      const dollar = (c: number) => (c / 100).toFixed(2)
      const fmtD = (d: string) => { try { return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) } catch { return d } }
      const styleM = tmpl.html_template.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
      const linkM = tmpl.html_template.match(/<link[^>]+>/gi) ?? []
      let pages = ''
      for (const line of payLines) {
        let pg = tmpl.html_template
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
          period_start: fmtD(String(run.period_start ?? '')),
          period_end: fmtD(String(run.period_end ?? '')),
        }
        for (const [k, v] of Object.entries(vars)) pg = pg.replace(new RegExp(`{{${k}}}`, 'g'), v)
        const bodyM = pg.match(/<body[^>]*>([\s\S]*)<\/body>/i)
        pages += `<div style="page-break-after:always">${bodyM?.[1] ?? pg}</div>`
      }
      const full = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">${linkM.join('')}<style>${styleM?.[1] ?? ''}</style></head><body>${pages}</body></html>`
      return NextResponse.json({ html: full, source: 'global_template' })
    }
  }

  // Generate with Claude Sonnet
  const docPrompt = DOC_PROMPTS[type] ?? `Create a professional ${type} document`
  const dataStr = JSON.stringify(data, null, 2).slice(0, 4000)

  const systemPrompt = `You are an expert HTML/CSS document designer. Generate beautiful, print-ready HTML documents.

CRITICAL RULES:
- Return ONLY the complete HTML document — nothing else, no markdown, no explanation
- Use a single <style> block with print-optimised CSS
- Use @media print { } to ensure it looks perfect when printed to PDF
- Use Google Fonts via a <link> tag for beautiful typography
- CSS variables for brand colors
- No external dependencies except Google Fonts
- Self-contained — all CSS inline in <style> tag
- Must look professional enough to send to clients or submit to ATO
- Use the actual data provided — never use placeholder values like "John Doe" or "XXXX"
- Brand color: #2D5240 (dark green) unless specified otherwise

DESIGN QUALITY BAR: Should look as good as documents from Xero, MYOB, or Square. Modern, clean, professional.`

  const userPrompt = `${docPrompt}

Business: ${biz.name}${biz.abn ? ` (ABN: ${biz.abn})` : ''}
Industry: ${biz.industry ?? 'retail'}
${style_preferences ? `Style preferences: ${style_preferences}` : ''}

DATA TO POPULATE THE DOCUMENT:
${dataStr}

Generate the complete HTML document now. Use this exact data — not placeholders.`

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  let html = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  // Strip any accidental markdown code fences
  html = html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
    return NextResponse.json({ error: 'Generation failed — invalid HTML returned' }, { status: 500 })
  }

  // Save as default template for this business type
  await supabaseAdmin.from('document_templates').upsert({
    business_id,
    type,
    name: `${biz.name} ${type} template`,
    html_template: html,
    is_default: true,
    created_by: 'aria',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,type,is_default' }).catch(() => {})

  return NextResponse.json({ html, source: 'generated' })
}

// Simple template variable replacement
function renderTemplate(template: string, data: Record<string, unknown>, biz: Record<string, unknown>): string {
  let rendered = template
  // Replace {{variable}} patterns with actual data
  const flat = flattenObject({ ...data, business: biz })
  for (const [key, value] of Object.entries(flat)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), String(value ?? ''))
  }
  return rendered
}

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey))
    } else {
      result[fullKey] = value
    }
  }
  return result
}

export const POST = withErrorCapture('documents/generate', _POST)
