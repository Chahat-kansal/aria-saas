export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { encryptCustomerPII } from '@/lib/aria/customer-pii'

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
  // SECURITY-RESIDUE-FIX-1 PART 5 — this update wrote name/phone/email/notes to their plaintext
  // columns only, leaving *_enc (src/lib/aria/customer-pii.ts) stale — any reader that ever trusts
  // ciphertext over plaintext would keep serving the pre-edit value forever. encryptCustomerPII only
  // emits *_enc for fields actually present in its `src` object, so only PII keys genuinely present
  // in THIS PATCH body are included below — an untouched field's ciphertext is never clobbered.
  const piiSrc: Partial<Record<'email' | 'phone' | 'name' | 'notes', string | null>> = {}
  for (const f of ['email', 'phone', 'name', 'notes'] as const) {
    if (f in body) piiSrc[f] = body[f] as string | null
  }
  Object.assign(allowed, encryptCustomerPII(piiSrc, bid))

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