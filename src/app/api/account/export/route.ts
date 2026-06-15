export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { decryptCustomerPII } from '@/lib/aria/customer-pii'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // SEC-4 — rate limit: one export per hour per user (Australian Privacy Act DSAR abuse guard)
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
  const { data: recentExport } = await supabaseAdmin
    .from('admin_audit_log')
    .select('id')
    .eq('admin_email', user.email ?? '')
    .eq('action', 'data_export')
    .gte('created_at', oneHourAgo)
    .limit(1)
    .maybeSingle()
  if (recentExport) {
    return NextResponse.json({ error: 'Rate limited — one data export per hour. Try again later.' }, { status: 429 })
  }

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)

  const businessIds = (businesses ?? []).map((b: { id: string }) => b.id)

  const [customers, sales, products, conversations] = businessIds.length > 0
    ? await Promise.all([
        supabaseAdmin.from('pos_customers').select('*').in('business_id', businessIds),
        supabaseAdmin.from('pos_sales').select('*').in('business_id', businessIds),
        supabaseAdmin.from('pos_products').select('*').in('business_id', businessIds),
        supabaseAdmin.from('aria_conversations').select('*').in('business_id', businessIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  // SEC-4 — return decrypted PII (prefers ciphertext, falls back to retained plaintext) and
  // never leak the *_enc ciphertext columns into the export.
  const exportedCustomers = (customers.data ?? []).map((c: Record<string, unknown>) => {
    const pii = decryptCustomerPII(c, String(c.business_id ?? ''))
    const rest = { ...c }
    delete (rest as Record<string, unknown>).email_enc
    delete (rest as Record<string, unknown>).phone_enc
    delete (rest as Record<string, unknown>).name_enc
    delete (rest as Record<string, unknown>).notes_enc
    return { ...rest, ...pii }
  })

  const exportData = {
    exported_at: new Date().toISOString(),
    user_id: user.id,
    businesses: businesses ?? [],
    pos_customers: exportedCustomers,
    pos_sales: sales.data ?? [],
    pos_products: products.data ?? [],
    aria_conversations: conversations.data ?? [],
  }

  // SEC-4 Part 6 — audit this bulk PII read (who, when, which businesses)
  await supabaseAdmin.from('admin_audit_log').insert({
    admin_email: user.email ?? user.id,
    action: 'data_export',
    target_type: 'business',
    target_id: businessIds[0] ?? null,
    details: { business_ids: businessIds, customer_count: exportedCustomers.length },
    created_at: new Date().toISOString(),
  })

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="aria-data-export.json"',
    },
  })
}

export const GET = withErrorCapture('account/export', _GET)
// Australian Privacy Act DSAR — also expose as POST per SEC-4 spec (same handler)
export const POST = withErrorCapture('account/export', _GET)
