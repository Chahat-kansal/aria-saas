export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
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
  if (!bid) return NextResponse.json({ overrides: [] })
  const { data: outlets } = await supabase.from('pos_outlets').select('id').eq('business_id', bid)
  const outletIds = (outlets ?? []).map(o => o.id)
  if (outletIds.length === 0) return NextResponse.json({ overrides: [] })
  const { data } = await supabase.from('pos_outlet_tax_codes').select('*').in('outlet_id', outletIds)
  return NextResponse.json({ overrides: data ?? [] })
}

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { outlet_id, tax_code_id, rate_override } = await req.json()
  if (!outlet_id || !tax_code_id) return NextResponse.json({ error: 'outlet_id + tax_code_id required' }, { status: 400 })
  // Ownership check: outlet belongs to this business
  const { data: outlet } = await supabase.from('pos_outlets').select('id').eq('id', outlet_id).eq('business_id', bid).maybeSingle()
  if (!outlet) return NextResponse.json({ error: 'Outlet not found' }, { status: 404 })
  const { data, error } = await supabase.from('pos_outlet_tax_codes').upsert({
    outlet_id, tax_code_id,
    rate_override: rate_override == null ? null : (Number(rate_override) || 0),
    is_active: true,
  }, { onConflict: 'outlet_id,tax_code_id' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ override: data })
}

export const GET = withErrorCapture('pos/outlet-tax-overrides', _GET)
export const POST = withBusinessContext('pos/outlet-tax-overrides', _POST)
