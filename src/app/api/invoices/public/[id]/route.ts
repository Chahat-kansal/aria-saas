export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getBusinessAddress } from '@/lib/business-address'

async function _GET(req: Request, { params }: { params: { id: string } }) {
  const { data: inv } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, status, issue_date, due_date, bill_to_name, bill_to_email, bill_to_address, subtotal, gst_total, total, notes, pdf_url, paid_at, business_id, viewed_at, signature_token, signed_at, signed_by_name')
    .eq('id', params.id)
    .maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // SECURITY-P1 (H-06) — UUID-only gate used to return full bill-to PII + financial totals to
  // anyone with (or guessing) the invoice UUID. The view token is the same signature_token already
  // generated at send-time and embedded in the emailed link (?t=) — a plain 404 on mismatch (not
  // 401/403) avoids confirming the UUID exists to a caller without the right token.
  const token = new URL(req.url).searchParams.get('t')
  if (!inv.signature_token || token !== inv.signature_token) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name, abn, address, phone, logo_url')
    .eq('id', inv.business_id)
    .maybeSingle()

  // ADDRESS-1 (Part B.4b) — full formatted address (street + suburb + state +
  // postcode), not just the street line, for a proper AU tax invoice.
  const resolvedAddress = inv.business_id ? await getBusinessAddress(inv.business_id) : null
  const bizWithFullAddress = biz ? { ...biz, address: resolvedAddress?.formatted || biz.address } : null

  const { data: lines } = await supabaseAdmin
    .from('invoice_line_items')
    .select('id, description, quantity, unit_price, gst_applicable, line_total')
    .eq('invoice_id', params.id)
    .order('position')

  // Track first view
  if (!inv.viewed_at) {
    void supabaseAdmin.from('invoices').update({ viewed_at: new Date().toISOString() }).eq('id', params.id)
  }

  return NextResponse.json({ invoice: inv, business: bizWithFullAddress, lines: lines ?? [] })
}

export const GET = withErrorCapture('invoices/public/[id]', _GET)
