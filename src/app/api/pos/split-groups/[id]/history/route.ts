export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Ctx = { params: Promise<{ id: string }> | { id: string } }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ history: [] })

  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') ?? '20')
  const offset = parseInt(searchParams.get('offset') ?? '0')

  // Get all splits for this group, grouped by sale
  const { data: splits } = await supabase.from('pos_sale_splits')
    .select('*, pos_split_payments(method, amount)')
    .eq('business_id', bid)
    .eq('group_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Group by sale_id
  const saleMap: Record<string, any> = {}
  for (const split of splits ?? []) {
    if (!saleMap[split.sale_id]) {
      saleMap[split.sale_id] = { sale_id: split.sale_id, visit_date: split.created_at, splits: [], total: 0 }
    }
    saleMap[split.sale_id].splits.push(split)
    saleMap[split.sale_id].total += split.total_amount ?? 0
  }

  const history = Object.values(saleMap).sort((a: any, b: any) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())
  return NextResponse.json({ history })
}

export const GET = withErrorCapture('pos/split-groups/[id]/history', _GET)