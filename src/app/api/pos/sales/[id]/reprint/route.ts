export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function _POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { method = 'print', email, phone } = await req.json().catch(() => ({}))

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = active?.business_id ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: sale } = await supabase
    .from('pos_sales')
    .select('*, pos_sale_items(*)')
    .eq('id', id).eq('business_id', bid).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

  if (method === 'email' && email) {
    const resendKey = process.env.RESEND_API_KEY
    const domain = process.env.RESEND_FROM_DOMAIN ?? 'ariaos.site'
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `Aria POS <aria@${domain}>`,
          to: email,
          subject: `Receipt #${(sale.sale_number ?? id.slice(-6)).toString().toUpperCase()}`,
          html: `<p>Thank you for your purchase. Total: A$${Number(sale.total_amount ?? 0).toFixed(2)}</p>`,
        }),
      }).catch(() => {})
    }
  }

  await supabase.from('pos_audit_log').insert({
    business_id: bid, action: 'reprint', sale_id: id,
    performed_by: user.id, reason_note: `method: ${method}`,
  })

  return NextResponse.json({ ok: true, sale })
}

export const POST = withErrorCapture('pos/sales/[id]/reprint', _POST)