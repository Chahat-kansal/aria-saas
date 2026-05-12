export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sale_id, email, business_id } = await req.json() as { sale_id: string; email: string; business_id: string }
    if (!sale_id || !email || !business_id) return NextResponse.json({ error: 'sale_id, email, business_id required' }, { status: 400 })

    const { data: biz } = await supabase.from('businesses')
      .select('id,name').eq('id', business_id).eq('user_id', user.id).maybeSingle()
    if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: sale } = await supabase.from('pos_sales')
      .select('*, pos_customers(name,email), pos_sale_items(product_name,quantity,unit_price,line_total,discount_percent)')
      .eq('id', sale_id).eq('business_id', business_id).maybeSingle()
    if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

    const items: any[] = sale.pos_sale_items ?? []
    const customer = (sale.pos_customers as any)
    const receiptNum = sale.sale_number ?? sale.id.slice(-8).toUpperCase()
    const saleDate = new Date(sale.created_at).toLocaleString('en-AU')
    const total = (sale.total_amount ?? 0).toFixed(2)
    const tax = (sale.tax_amount ?? 0).toFixed(2)

    const itemRows = items.map(i => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;">${i.quantity}× ${i.product_name}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;text-align:right;">A$${(i.line_total ?? 0).toFixed(2)}</td>
      </tr>`).join('')

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Receipt ${receiptNum}</title></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="font-size:20px;font-weight:700;margin:0;">${biz.name}</h1>
    <p style="color:#666;margin:4px 0;font-size:13px;">${saleDate}</p>
    <p style="color:#8B5CF6;font-size:12px;font-family:monospace;">Receipt #${receiptNum}</p>
  </div>
  ${customer ? `<p style="font-size:14px;margin-bottom:16px;">Customer: <strong>${customer.name}</strong></p>` : ''}
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${itemRows}</table>
  <div style="border-top:2px solid #1a1a1a;padding-top:12px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
      <span style="font-size:13px;color:#666;">GST included</span>
      <span style="font-size:13px;color:#666;">A$${tax}</span>
    </div>
    <div style="display:flex;justify-content:space-between;">
      <span style="font-size:16px;font-weight:700;">Total</span>
      <span style="font-size:16px;font-weight:700;">A$${total}</span>
    </div>
    <p style="font-size:13px;color:#666;margin-top:8px;">Paid by ${(sale.payment_method ?? 'card').toUpperCase()}</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#999;margin-top:24px;">Thank you for shopping at ${biz.name}</p>
</body>
</html>`

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'Email not configured' }, { status: 503 })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${biz.name} <aria@${process.env.RESEND_FROM_DOMAIN ?? 'resend.dev'}>`,
        to: email,
        subject: `Your receipt from ${biz.name} — #${receiptNum}`,
        html,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      return NextResponse.json({ error: `Email failed: ${errText}` }, { status: 502 })
    }

    // Log action
    await supabase.from('pos_action_log').insert({
      business_id,
      action_type: 'email_receipt',
      description: `Receipt #${receiptNum} emailed to ${email}`,
      sale_id,
      performed_by: user.email,
    })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

export const POST = withErrorCapture('pos/email-receipt', _POST)
