export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  let business_id = searchParams.get('business_id')

  // EXPORT-TRIAL-FIX — data export is an AU Privacy Act (APP) right that must work regardless of
  // subscription/trial status, so resolve from OWNERSHIP, never from the active-context pointer
  // (which is cleared/blocked when a trial ends). If the caller didn't pass an explicit business_id
  // (the billing page + trial-banner links don't), pick the user's owned business: active-if-owned
  // first, then oldest. Never throw "business_id required" for a logged-in owner with ≥1 business.
  if (!business_id) {
    const { data: owned } = await supabase.from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: true })
    if (!owned || owned.length === 0) {
      return NextResponse.json({ error: 'No business found for your account' }, { status: 404 })
    }
    business_id = owned[0].id
  }

  // Verify ownership — works for lapsed/expired owners (ownership never lapses); a business the
  // user does not own returns null → 404, so a lapsed owner can export THEIR data, not anyone's.
  const { data: biz } = await supabase.from('businesses')
    .select('id, name, industry, created_at')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch all business data in parallel
  const [
    productsRes,
    salesRes,
    customersRes,
    invoicesRes,
    expensesRes,
    loyaltyConfigRes,
  ] = await Promise.all([
    supabaseAdmin.from('pos_products')
      .select('id, name, sku, barcode, price, category, stock_quantity, track_stock, is_active, created_at')
      .eq('business_id', business_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(10000),

    supabaseAdmin.from('pos_sales')
      .select('id, sale_number, total_amount, payment_method, status, customer_id, created_at, pos_sale_items(product_name, quantity, unit_price, line_total)')
      .eq('business_id', business_id)
      .neq('status', 'voided')
      .order('created_at', { ascending: true })
      .limit(50000),

    supabaseAdmin.from('pos_customers')
      .select('id, name, email, phone, birthday, tags, points_balance, total_spent, visit_count, last_visit_at, marketing_consent, created_at')
      .eq('business_id', business_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(10000),

    supabaseAdmin.from('invoices')
      .select('id, invoice_number, status, bill_to_name, bill_to_email, subtotal, gst_total, total, issue_date, due_date, paid_at, created_at')
      .eq('business_id', business_id)
      .order('created_at', { ascending: true })
      .limit(10000),

    supabaseAdmin.from('business_expenses')
      .select('id, label, amount, category, date, created_at')
      .eq('business_id', business_id)
      .order('date', { ascending: true })
      .limit(10000),

    supabaseAdmin.from('pos_loyalty_config')
      .select('*')
      .eq('business_id', business_id)
      .maybeSingle(),
  ])

  const exportPayload = {
    export_meta: {
      business_id,
      business_name: biz.name,
      industry: biz.industry,
      exported_at: new Date().toISOString(),
      exported_by: user.id,
      version: '1',
    },
    business: biz,
    products: productsRes.data ?? [],
    sales: salesRes.data ?? [],
    customers: customersRes.data ?? [],
    invoices: invoicesRes.data ?? [],
    expenses: expensesRes.data ?? [],
    loyalty_config: loyaltyConfigRes.data ?? null,
    summary: {
      products: (productsRes.data ?? []).length,
      sales: (salesRes.data ?? []).length,
      customers: (customersRes.data ?? []).length,
      invoices: (invoicesRes.data ?? []).length,
      expenses: (expensesRes.data ?? []).length,
    },
  }

  const filename = 'aria-export-' + biz.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.json'

  return new Response(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
    },
  })
}

export const GET = withErrorCapture('business/export', _GET)
