export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (body.confirm !== 'DELETE MY DATA') {
    return NextResponse.json({ error: 'Confirmation required: send { confirm: "DELETE MY DATA" }' }, { status: 400 })
  }

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)

  const businessIds = (businesses ?? []).map((b: { id: string }) => b.id)

  if (businessIds.length > 0) {
    // Collect sale IDs so we can delete pos_sale_items (no business_id — join through pos_sales)
    const { data: salesData } = await supabaseAdmin
      .from('pos_sales')
      .select('id')
      .in('business_id', businessIds)
    const saleIds = (salesData ?? []).map((s: { id: string }) => s.id)

    if (saleIds.length > 0) {
      await supabaseAdmin.from('pos_sale_items').delete().in('sale_id', saleIds)
    }

    // Delete child tables (business_id) before businesses
    await supabaseAdmin.from('aria_conversations').delete().in('business_id', businessIds)
    await supabaseAdmin.from('aria_ai_calls').delete().in('business_id', businessIds)
    await supabaseAdmin.from('aria_autopilot_actions').delete().in('business_id', businessIds)
    await supabaseAdmin.from('pos_sales').delete().in('business_id', businessIds)
    await supabaseAdmin.from('pos_customers').delete().in('business_id', businessIds)
    await supabaseAdmin.from('pos_products').delete().in('business_id', businessIds)
    await supabaseAdmin.from('pos_shift_reports').delete().in('business_id', businessIds)
    await supabaseAdmin.from('seo_audits').delete().in('business_id', businessIds)
    await supabaseAdmin.from('businesses').delete().in('id', businessIds)
  }

  await supabaseAdmin.auth.admin.deleteUser(user.id)

  return NextResponse.json({ deleted: true })
}

export const DELETE = withErrorCapture('account/delete', _DELETE)
