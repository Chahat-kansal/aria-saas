export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

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
  if (!bid) return NextResponse.json({ tax_codes: [] })
  const { data, error } = await supabase.from('pos_tax_codes')
    .select('*').eq('business_id', bid).eq('is_active', true)
    .order('is_system', { ascending: false }).order('code')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tax_codes: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json()
  const rate = Number(body.rate) || 0
  if (rate < 0 || rate > 100) return NextResponse.json({ error: 'Rate must be 0-100' }, { status: 400 })
  const allowedCategories = ['standard', 'reduced', 'zero', 'exempt', 'special', 'luxury']
  const category = allowedCategories.includes(body.category) ? body.category : 'standard'
  const { data, error } = await supabase.from('pos_tax_codes').insert({
    business_id: bid,
    code: String(body.code ?? '').toUpperCase().slice(0, 30),
    name: String(body.name ?? '').slice(0, 100),
    rate, category,
    is_inclusive: body.is_inclusive !== false,
    applies_on_top_of_tax_code_id: body.applies_on_top_of_tax_code_id ?? null,
    description: body.description ?? null,
    is_system: false,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tax_code: data })
}

export const GET = withErrorCapture('pos/tax-codes', _GET)
export const POST = withErrorCapture('pos/tax-codes', _POST)
