export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const DEFAULT_KPIS = ['revenue', 'transactions', 'avg_order_value', 'new_customers', 'top_product']

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ kpis: DEFAULT_KPIS })

  const { data: biz } = await supabaseAdmin.from('businesses')
    .select('weekly_report_kpis, weekly_report_enabled, weekly_report_email, email')
    .eq('id', bid).maybeSingle()

  return NextResponse.json({
    kpis: (biz?.weekly_report_kpis as string[] | null) ?? DEFAULT_KPIS,
    weekly_report_enabled: biz?.weekly_report_enabled ?? true,
    report_email: biz?.weekly_report_email || biz?.email || null,
  })
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { kpis?: string[] }
  if (!Array.isArray(body.kpis) || body.kpis.length === 0) {
    return NextResponse.json({ error: 'kpis array required' }, { status: 400 })
  }

  const allowed = ['revenue', 'transactions', 'avg_order_value', 'labour_cost_pct', 'customer_count', 'new_customers', 'top_product', 'low_stock_count']
  const kpis = body.kpis.filter(k => allowed.includes(k))

  const { error } = await supabaseAdmin.from('businesses')
    .update({ weekly_report_kpis: kpis })
    .eq('id', bid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, kpis })
}
