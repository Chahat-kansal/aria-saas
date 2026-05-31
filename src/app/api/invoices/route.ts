export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { validateBody } from '@/lib/api/validate'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const LineSchema = z.object({
  description: z.string().max(500).optional().default(''),
  quantity: z.number().positive().optional().default(1),
  unit_price: z.number().min(0),
  gst_applicable: z.boolean().optional().default(true),
})

const CreateInvoiceSchema = z.object({
  business_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  bill_to_name: z.string().min(1).max(300),
  bill_to_email: z.string().email().optional().nullable(),
  bill_to_address: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  issue_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  lines: z.array(LineSchema).min(1),
  ai_generated: z.boolean().optional().default(false),
})

function calcLine(qty: number, unitPrice: number, gstApplicable: boolean) {
  const line_subtotal = qty * unitPrice
  const line_gst = gstApplicable ? Math.round(line_subtotal * 0.10 * 100) / 100 : 0
  const line_total = line_subtotal + line_gst
  return { line_subtotal, line_gst, line_total }
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const status = searchParams.get('status') ?? ''
  let query = supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, status, bill_to_name, bill_to_email, subtotal, gst_total, total, currency, issue_date, due_date, sent_at, paid_at, send_method, pdf_url, ai_generated, created_at, customer_id, viewed_at, auto_reminders')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute overdue on read
  const now = new Date()
  const invoices = (data ?? []).map(inv => ({
    ...inv,
    status: inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < now
      ? 'overdue' : inv.status,
  }))

  return NextResponse.json({ invoices })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await validateBody(req, CreateInvoiceSchema)
  if ('error' in parsed) return parsed.error
  const { business_id, customer_id, bill_to_name, bill_to_email, bill_to_address, notes,
          issue_date, due_date, lines, ai_generated } = parsed.data

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get/upsert invoice settings and claim next seq
  const { data: settings } = await supabaseAdmin
    .from('invoice_settings').select('*').eq('business_id', business_id).maybeSingle()
  const prefix = settings?.invoice_prefix ?? 'INV-'
  const seq = settings?.next_invoice_seq ?? 1
  const invoice_number = prefix + String(seq).padStart(4, '0')

  await supabaseAdmin.from('invoice_settings').upsert(
    { business_id, next_invoice_seq: seq + 1 },
    { onConflict: 'business_id' },
  )

  // Deterministic maths
  const computedLines = lines.map((l: { description: string; quantity: number; unit_price: number; gst_applicable: boolean }, i: number) => {
    const qty = Number(l.quantity) || 1
    const up = Number(l.unit_price) || 0
    const gst = l.gst_applicable !== false
    const { line_subtotal, line_gst, line_total } = calcLine(qty, up, gst)
    return { description: l.description, quantity: qty, unit_price: up, gst_applicable: gst,
             line_subtotal, line_gst, line_total, position: i }
  })

  const subtotal = computedLines.reduce((s, l) => s + l.line_subtotal, 0)
  const gst_total = computedLines.reduce((s, l) => s + l.line_gst, 0)
  const total = subtotal + gst_total

  const { data: inv, error: invErr } = await supabaseAdmin.from('invoices').insert({
    business_id, customer_id: customer_id || null, invoice_number, status: 'draft',
    bill_to_name, bill_to_email: bill_to_email || null, bill_to_address: bill_to_address || null,
    notes: notes || null, issue_date: issue_date || new Date().toISOString().slice(0, 10),
    due_date: due_date || null, subtotal, gst_total, total, currency: 'AUD',
    ai_generated: ai_generated === true,
  }).select('*').single()

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  const lineRows = computedLines.map(l => ({ ...l, invoice_id: (inv as { id: string }).id, business_id }))
  await supabaseAdmin.from('invoice_line_items').insert(lineRows)

  return NextResponse.json({ invoice: inv }, { status: 201 })
}

export const GET  = withErrorCapture('invoices', _GET)
export const POST = withErrorCapture('invoices', _POST)
