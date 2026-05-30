export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
  const { data } = await supabase.from('businesses').select('id, name').eq('id', bid).eq('user_id', userId).single()
  return data ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { business_id: string; po_id: string; supplier_email?: string }
  const { business_id, po_id, supplier_email } = body

  if (!business_id || !po_id) {
    return NextResponse.json({ error: 'business_id and po_id required' }, { status: 400 })
  }

  const biz = await verifyBiz(supabase, user.id, business_id)
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: po } = await supabaseAdmin
    .from('warehouse_purchase_orders')
    .select('*')
    .eq('id', po_id)
    .eq('business_id', business_id)
    .single()

  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  if (po.status !== 'draft') return NextResponse.json({ error: 'Only draft POs can be sent' }, { status: 400 })

  const toEmail = supplier_email ?? null
  const lineItems: { item_name: string; suggested_qty: number; estimated_cost_aud?: number }[] = po.line_items ?? []
  const totalAud = (po.total_cost_cents ?? 0) / 100

  const linesHtml = lineItems.map(li =>
    '<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">' + (li.item_name ?? 'Item') + '</td>' +
    '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">' + (li.suggested_qty ?? 0) + '</td>' +
    '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">A$' + ((li.estimated_cost_aud ?? 0) * (li.suggested_qty ?? 0)).toFixed(2) + '</td></tr>'
  ).join('')

  const html = '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">' +
    '<h2 style="font-size:20px;font-weight:700;margin-bottom:4px">Purchase Order — ' + po.po_number + '</h2>' +
    '<p style="color:#666;margin-bottom:24px">From: ' + (biz.name ?? 'Business') + ' · ' + new Date().toLocaleDateString('en-AU') + '</p>' +
    (po.expected_delivery ? '<p><strong>Expected delivery:</strong> ' + po.expected_delivery + '</p>' : '') +
    (po.notes ? '<p><strong>Notes:</strong> ' + po.notes + '</p>' : '') +
    '<table style="width:100%;border-collapse:collapse;margin-top:16px">' +
    '<thead><tr style="background:#f5f5f5"><th style="padding:8px 12px;text-align:left">Item</th><th style="padding:8px 12px;text-align:center">Qty</th><th style="padding:8px 12px;text-align:right">Total</th></tr></thead>' +
    '<tbody>' + linesHtml + '</tbody>' +
    '<tfoot><tr><td colspan="2" style="padding:10px 12px;font-weight:700">Total</td><td style="padding:10px 12px;font-weight:700;text-align:right">A$' + totalAud.toFixed(2) + '</td></tr></tfoot>' +
    '</table>' +
    '<p style="margin-top:24px;color:#888;font-size:12px">This PO was sent via Aria OS.</p>' +
    '</div>'

  // Mark as sent even if email not configured (allow PO to progress in workflow)
  await supabaseAdmin
    .from('warehouse_purchase_orders')
    .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', po_id)
    .eq('business_id', business_id)

  const resendKey = process.env.RESEND_API_KEY
  if (resendKey && toEmail) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'orders@aria.app',
          to: [toEmail],
          subject: 'Purchase Order ' + po.po_number + ' from ' + (biz.name ?? 'Aria'),
          html,
        }),
      })
    } catch { /* non-critical */ }
  }

  return NextResponse.json({ ok: true, emailed: !!(resendKey && toEmail) })
}

export const POST = withErrorCapture('warehouse/purchase-orders/send', _POST)
