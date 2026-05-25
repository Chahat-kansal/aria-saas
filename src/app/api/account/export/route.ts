export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const exportData = {
    exported_at: new Date().toISOString(),
    user_id: user.id,
    businesses: businesses ?? [],
    pos_customers: customers.data ?? [],
    pos_sales: sales.data ?? [],
    pos_products: products.data ?? [],
    aria_conversations: conversations.data ?? [],
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="aria-data-export.json"',
    },
  })
}

export const GET = withErrorCapture('account/export', _GET)
