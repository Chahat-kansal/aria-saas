export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, { params }: { params: Promise<{ id: string }> | { id: string } }, { supabase, businessId: bid }: BusinessContext) {
  const { id } = 'then' in params ? await params : params
  const { data: customer, error } = await supabase
    .from('pos_customers')
    .select('*')
    .eq('id', id)
    .eq('business_id', bid)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Purchase history (last 20 sales)
  const { data: sales } = await supabase
    .from('pos_sales')
    .select('id, total_amount, payment_method, created_at, pos_sale_items(product_name, quantity, unit_price)')
    .eq('business_id', bid)
    .eq('customer_id', id)
    .neq('status', 'voided')
    .order('created_at', { ascending: false })
    .limit(20)

  // Loyalty transactions (last 20)
  const { data: loyaltyTx } = await supabase
    .from('pos_loyalty_transactions')
    .select('id, type, points_delta, stamps_delta, reward_redeemed, created_at')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ customer, sales: sales ?? [], loyalty_transactions: loyaltyTx ?? [] })
}

export const GET = withBusinessContext('pos/customers/[id]', _GET)

async function _PATCH(req: Request, { params }: { params: Promise<{ id: string }> | { id: string } }, { supabase, businessId: bid }: BusinessContext) {
  const { id } = 'then' in params ? await params : params
  const rawBody = await req.json().catch(() => null)
  if (!rawBody || typeof rawBody !== 'object') return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const body = rawBody as Record<string, unknown>
  const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const SAFE = ['name','phone','email','birthday','notes','tags','marketing_consent','points_balance','stamps_count','abn','tax_exempt','tax_exempt_type','tax_exempt_certificate','tax_exempt_expires_at'] as const
  for (const k of SAFE) {
    if (k in body) allowed[k] = body[k]
  }

  const { error } = await supabase.from('pos_customers').update(allowed).eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withBusinessContext('pos/customers/[id]', _PATCH)

async function _DELETE(_req: Request, { params }: { params: Promise<{ id: string }> | { id: string } }, { supabase, userId, businessId: bid }: BusinessContext) {
  const { id } = 'then' in params ? await params : params

  // Soft-delete: preserve customer data, just hide from active lists
  const { data: existing } = await supabase.from('pos_customers').select('id, name, email, phone').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('pos_customers').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log — non-fatal
  await Promise.resolve(supabaseAdmin.from('deletion_audit_log').insert({
    table_name: 'pos_customers',
    row_id: id,
    action: 'soft_delete',
    old_data: existing,
    performed_by: userId,
    business_id: bid,
    reason: 'owner_deleted',
  })).catch(() => {})

  return NextResponse.json({ ok: true })
}

export const DELETE = withBusinessContext('pos/customers/[id]', _DELETE)