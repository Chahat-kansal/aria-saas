export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { encryptCustomerPII } from '@/lib/aria/customer-pii'
import { normaliseCustomerPhone } from '@/lib/phone'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const business_id = String(body.business_id ?? '')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const startedAt = new Date().toISOString()
  let imported = 0, skipped = 0

  try {
    const { data: squareCusts } = await supabaseAdmin
      .from('square_customers')
      .select('square_customer_id, name, email, phone, last_visit_at, visit_count, total_spent_cents, tags')
      .eq('business_id', business_id)

    if (!squareCusts?.length) {
      await supabaseAdmin.from('pos_integration_sync_events').insert({
        business_id, integration_key: 'square', event_type: 'customer_import',
        status: 'completed', records_count: 0, started_at: startedAt, completed_at: new Date().toISOString(),
      })
      return NextResponse.json({ imported: 0, skipped: 0, message: 'No Square customers to import' })
    }

    for (const sc of squareCusts) {
      if (!sc.email && !sc.phone) { skipped++; continue }

      const { data: existing } = await supabaseAdmin
        .from('pos_customers')
        .select('id, total_spent, total_spend, visit_count')
        .eq('business_id', business_id)
        .or(`${sc.email ? `email.eq.${sc.email}` : 'id.neq.00000000-0000-0000-0000-000000000000'},${sc.phone ? `phone.eq.${sc.phone}` : 'id.neq.00000000-0000-0000-0000-000000000000'}`)
        .maybeSingle()

      const squareSpend = Number(sc.total_spent_cents ?? 0) / 100
      const squareVisits = Number(sc.visit_count ?? 0)

      if (existing) {
        const mergedSpend = Math.max(Number(existing.total_spent ?? existing.total_spend ?? 0), squareSpend)
        const mergedVisits = Math.max(Number(existing.visit_count ?? 0), squareVisits)
        await supabaseAdmin.from('pos_customers').update({
          square_customer_id: sc.square_customer_id,
          total_spent: mergedSpend,
          total_spend: mergedSpend,
          visit_count: mergedVisits,
          ...(sc.last_visit_at ? { last_visit: sc.last_visit_at, last_visit_at: sc.last_visit_at } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
        imported++
      } else {
        await supabaseAdmin.from('pos_customers').insert({
          business_id,
          name: sc.name ?? 'Unknown',
          email: sc.email ?? null,
          phone: sc.phone ? normaliseCustomerPhone(sc.phone) : null,   // CUSTOMER-PHONE-1
          // SEC-4 — dual-write encrypted PII alongside retained plaintext
          ...encryptCustomerPII({ name: sc.name ?? 'Unknown', email: sc.email ?? null, phone: sc.phone ?? null }, business_id),
          square_customer_id: sc.square_customer_id,
          total_spent: squareSpend,
          total_spend: squareSpend,
          visit_count: squareVisits,
          last_visit: sc.last_visit_at ?? null,
          last_visit_at: sc.last_visit_at ?? null,
          tags: sc.tags ?? [],
          source: 'square',
          created_at: new Date().toISOString(),
        })
        imported++
      }
    }

    await supabaseAdmin.from('pos_integration_sync_events').insert({
      business_id, integration_key: 'square', event_type: 'customer_import',
      status: 'completed', records_count: imported,
      started_at: startedAt, completed_at: new Date().toISOString(),
    })

    return NextResponse.json({ imported, skipped })
  } catch (e) {
    await supabaseAdmin.from('pos_integration_sync_events').insert({
      business_id, integration_key: 'square', event_type: 'customer_import',
      status: 'failed', records_count: imported,
      error_message: (e as Error).message,
      started_at: startedAt, completed_at: new Date().toISOString(),
    })
    throw e
  }
}

export const POST = withErrorCapture('customers/import/square', _POST)
