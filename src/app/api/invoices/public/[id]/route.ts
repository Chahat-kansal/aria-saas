export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const { data: inv } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, status, issue_date, due_date, bill_to_name, bill_to_email, bill_to_address, subtotal, gst_total, total, notes, pdf_url, paid_at, business_id, viewed_at')
    .eq('id', params.id)
    .maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name, abn, address, phone, logo_url')
    .eq('id', inv.business_id)
    .maybeSingle()

  const { data: lines } = await supabaseAdmin
    .from('invoice_line_items')
    .select('id, description, quantity, unit_price, gst_applicable, line_total')
    .eq('invoice_id', params.id)
    .order('position')

  // Track first view
  if (!inv.viewed_at) {
    void supabaseAdmin.from('invoices').update({ viewed_at: new Date().toISOString() }).eq('id', params.id)
  }

  return NextResponse.json({ invoice: inv, business: biz ?? null, lines: lines ?? [] })
}

export const GET = withErrorCapture('invoices/public/[id]', _GET)
