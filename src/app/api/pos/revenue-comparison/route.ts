export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function sumSales(bid: string, from: string, to: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('pos_sales')
    .select('total_amount')
    .eq('business_id', bid)
    .neq('status', 'voided')
    .gte('created_at', from)
    .lte('created_at', to)
  return (data ?? []).reduce((s, r) => s + (Number((r as { total_amount?: number }).total_amount) || 0), 0)
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)

  const yStart = new Date(todayStart); yStart.setDate(yStart.getDate() - 1)
  const yEnd = new Date(todayEnd); yEnd.setDate(yEnd.getDate() - 1)

  const lwStart = new Date(todayStart); lwStart.setDate(lwStart.getDate() - 7)
  const lwEnd = new Date(todayEnd); lwEnd.setDate(lwEnd.getDate() - 7)

  const [today, yesterday, lastWeek] = await Promise.all([
    sumSales(bid, todayStart.toISOString(), todayEnd.toISOString()),
    sumSales(bid, yStart.toISOString(), yEnd.toISOString()),
    sumSales(bid, lwStart.toISOString(), lwEnd.toISOString()),
  ])

  return NextResponse.json({ today, yesterday, lastWeek })
}

export const GET = withErrorCapture('pos/revenue-comparison', _GET)
