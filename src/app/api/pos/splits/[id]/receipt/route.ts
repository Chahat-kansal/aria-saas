export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { sendSMS } from '@/lib/clicksend'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { generateSplitReceiptHTML } from '@/lib/pos/split-receipt'

type Ctx = { params: Promise<{ id: string }> | { id: string } }

async function _POST(req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { delivery_method = 'print', email, phone } = body // 'print' | 'email' | 'sms'

  const { data: split } = await supabase.from('pos_sale_splits')
    .select('*, pos_split_items(*, pos_sale_items(product_name, quantity, unit_price, line_total))')
    .eq('id', id).maybeSingle()
  if (!split) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: sale } = await supabase.from('pos_sales').select('sale_number, created_at').eq('id', split.sale_id).maybeSingle()
  const { data: biz } = await supabase.from('businesses').select('name, city, email, phone').eq('id', split.business_id).maybeSingle()

  const items = ((split.pos_split_items ?? []) as any[]).map((si: any) => si.pos_sale_items).filter(Boolean)
  const html = generateSplitReceiptHTML(
    { split_number: split.split_number, person_label: split.person_label, subtotal: split.subtotal, tax_amount: split.tax_amount, tip_amount: split.tip_amount, total_amount: split.total_amount, status: split.status, paid_at: split.paid_at, split_method: split.split_method },
    { sale_number: sale?.sale_number ?? '—', created_at: sale?.created_at ?? new Date().toISOString() },
    { name: biz?.name ?? 'Business', city: biz?.city, email: biz?.email, phone: biz?.phone },
    items,
  )

  if (delivery_method === 'print') {
    return new Response(html, { headers: { 'Content-Type': 'text/html' } })
  }

  if (delivery_method === 'sms' && phone) {
    try {
      const msg = `Hi ${split.person_label}, your split from ${biz?.name ?? 'the restaurant'}: A$${split.total_amount.toFixed(2)}. Status: ${split.status}.`
      await sendSMS(phone, msg)
    } catch { /* non-fatal */ }
  }

  // Mark receipt as sent
  await supabase.from('pos_sale_splits').update({ receipt_sent_at: new Date().toISOString(), receipt_method: delivery_method, receipt_email: email ?? null, receipt_phone: phone ?? null }).eq('id', id)
  return NextResponse.json({ ok: true, html })
}

export const POST = withErrorCapture('pos/splits/[id]/receipt', _POST)