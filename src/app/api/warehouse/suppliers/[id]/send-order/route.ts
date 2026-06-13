export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function verifySupplier(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, supplierId: string) {
  const { data } = await supabase
    .from('pos_suppliers')
    .select('id, name, email, order_email, business_id, businesses!inner(user_id, name)')
    .eq('id', supplierId)
    .single()
  if (!data || (data.businesses as any).user_id !== userId) return null
  return data
}

function buildOrderEmail(params: {
  poNumber: string; businessName: string; supplierName: string;
  items: Array<{ product_name: string; supplier_code?: string; case_qty?: number; unit_cost: number; qty: number }>;
  notes?: string; totalEx: number; totalInc: number; expectedDate?: string;
}): string {
  const { poNumber, businessName, supplierName, items, notes, totalEx, totalInc, expectedDate } = params
  const lines = items.map(item => {
    const lineEx = item.unit_cost * item.qty
    const lineInc = lineEx * 1.1
    const caseQtyStr = item.case_qty ? String(item.case_qty) : '—'
    const code = item.supplier_code ?? '—'
    return `  ${item.product_name.padEnd(30)} | ${code.padEnd(12)} | ${caseQtyStr.padEnd(6)} | $${item.unit_cost.toFixed(2).padStart(8)} | ${item.qty} | $${lineEx.toFixed(2).padStart(10)} | $${lineInc.toFixed(2).padStart(10)}`
  }).join('\n')

  return `PURCHASE ORDER: ${poNumber}
Date: ${new Date().toLocaleDateString('en-AU')}
From: ${businessName}
To: ${supplierName}${expectedDate ? '\nExpected delivery: ' + expectedDate : ''}

${'Product'.padEnd(30)} | ${'Code'.padEnd(12)} | Cases  | Unit Cost | Qty  | Total (ex) | Total (inc)
${'-'.repeat(100)}
${lines}
${'-'.repeat(100)}
TOTAL: ${items.reduce((s, i) => s + i.qty, 0)} units | $${totalEx.toFixed(2)} (ex) | $${totalInc.toFixed(2)} (inc)
${notes ? '\nNotes: ' + notes : ''}

Please confirm receipt of this order and advise expected delivery date.

Sent by Aria OS — aria.com.au`
}

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rec = await verifySupplier(supabase, user.id, params.id)
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { business_id, po_id, items, notes, total_inc, expected_delivery_date } = body
  if (!po_id || !items?.length) return NextResponse.json({ error: 'po_id and items required' }, { status: 400 })

  // Fetch PO for po_number
  const { data: po } = await supabaseAdmin
    .from('warehouse_purchase_orders')
    .select('id, po_number, status')
    .eq('id', po_id)
    .single()
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })

  const businessName = (rec.businesses as any).name ?? 'Your Business'
  const totalEx = items.reduce((s: number, i: any) => s + (i.unit_cost ?? 0) * (i.qty ?? 0), 0)
  const totalInc2 = total_inc ?? totalEx * 1.1

  const emailBody = buildOrderEmail({
    poNumber: po.po_number ?? po_id,
    businessName,
    supplierName: rec.name,
    items,
    notes,
    totalEx,
    totalInc: totalInc2,
    expectedDate: expected_delivery_date,
  })

  const toEmail = rec.order_email ?? rec.email
  let emailSent = false
  if (toEmail && process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Aria <aria@ariaos.site>',
        to: toEmail,
        subject: 'Purchase Order ' + (po.po_number ?? po_id) + ' — ' + businessName,
        text: emailBody,
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null)
    emailSent = res?.ok ?? false
  }

  // Update PO status
  await supabaseAdmin.from('warehouse_purchase_orders').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
    sent_to_email: toEmail ?? null,
    expected_delivery_date: expected_delivery_date ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', po_id)

  // Record price points for each line item
  const priceRows = items.map((item: any) => ({
    business_id,
    supplier_id: params.id,
    product_id: item.product_id ?? null,
    product_name: item.product_name,
    supplier_code: item.supplier_code ?? null,
    cost_price: Number(item.unit_cost),
    source: 'po_confirmed',
  })).filter((r: any) => r.cost_price > 0)

  if (priceRows.length) {
    void Promise.resolve(supabaseAdmin.from('supplier_product_prices').insert(priceRows)).catch(() => {})
  }

  // Log to aria_ai_calls
  void Promise.resolve(supabaseAdmin.from('aria_ai_calls').insert({
    business_id, agent_key: 'send_supplier_order', provider: 'other',
    model_id: 'email', role: 'other', success: emailSent,
  })).catch(() => {})

  return NextResponse.json({ sent: emailSent, po_number: po.po_number ?? po_id, email_sent_to: toEmail ?? null })
}

export const POST = withErrorCapture('warehouse/suppliers/[id]/send-order', _POST)
