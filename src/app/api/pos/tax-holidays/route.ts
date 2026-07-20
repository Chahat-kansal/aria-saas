export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ holidays: [] })
  const { data } = await supabase.from('pos_tax_holidays').select('*').eq('business_id', bid).order('starts_at', { ascending: false })
  return NextResponse.json({ holidays: data ?? [] })
}

async function _POST(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json()
  if (!body.starts_at || !body.ends_at || new Date(body.ends_at) <= new Date(body.starts_at)) {
    return NextResponse.json({ error: 'starts_at and ends_at required, ends_at must be after starts_at' }, { status: 400 })
  }
  const { data, error } = await supabase.from('pos_tax_holidays').insert({
    business_id: bid,
    outlet_id: body.outlet_id ?? null,
    name: String(body.name ?? 'Tax holiday').slice(0, 100),
    starts_at: body.starts_at,
    ends_at: body.ends_at,
    affected_tax_code_ids: body.affected_tax_code_ids ?? [],
    affected_category_ids: body.affected_category_ids ?? [],
    affected_product_ids: body.affected_product_ids ?? [],
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ holiday: data })
}

export const GET = withErrorCapture('pos/tax-holidays', _GET)
export const POST = withBusinessContext('pos/tax-holidays', _POST)
