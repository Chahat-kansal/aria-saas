export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const INDUSTRY_DEFAULTS: Record<string, string[]> = {
  liquor:      ['Dan Murphy\'s', 'BWS', 'Liquorland', 'First Choice Liquor', 'Vintage Cellars'],
  cafe:        ['Gloria Jean\'s', 'The Coffee Club', 'Muffin Break', 'Starbucks'],
  restaurant:  ['Nando\'s', 'Grill\'d', 'Hungry Jack\'s', 'Red Rooster'],
  retail:      ['Woolworths', 'Coles', 'IGA', 'Aldi'],
  pharmacy:    ['Chemist Warehouse', 'Priceline', 'Terry White Chemmart'],
  supermarket: ['Woolworths', 'Coles', 'IGA', 'Aldi'],
  bakery:      ['Bakers Delight', 'Brumby\'s Bakery'],
  convenience: ['7-Eleven', 'Night Owl', 'IGA Express'],
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  const { data: watches } = await supabaseAdmin.from('aria_competitor_watches')
    .select('id,competitor_name,competitor_url,is_active')
    .eq('business_id', business_id).order('created_at', { ascending: true })
  // Auto-seed industry defaults if no watches exist yet
  if ((watches ?? []).length === 0) {
    const { data: biz } = await supabaseAdmin
      .from('businesses').select('industry').eq('id', business_id).maybeSingle()
    const industry = (biz?.industry as string ?? 'default').toLowerCase()
    const defaults = INDUSTRY_DEFAULTS[industry] ?? INDUSTRY_DEFAULTS['retail'] ?? []
    if (defaults.length > 0) {
      const rows = defaults.map(name => ({
        business_id, competitor_name: name, is_active: true,
        created_at: new Date().toISOString(),
      }))
      const { data: seeded } = await supabaseAdmin
        .from('aria_competitor_watches')
        .insert(rows)
        .select('id,competitor_name,competitor_url,is_active')
      return NextResponse.json({ watches: seeded ?? [], auto_seeded: true })
    }
  }
  return NextResponse.json({ watches: watches ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { business_id, competitor_name, competitor_url } = await req.json()
  if (!business_id || !competitor_name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const { data } = await supabaseAdmin.from('aria_competitor_watches').insert({
    business_id, competitor_name, competitor_url: competitor_url || null,
    is_active: true, created_at: new Date().toISOString(),
  }).select('id').single()
  return NextResponse.json({ ok: true, id: data?.id })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('aria_competitor_watches').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('aria/competitor-watches', _GET)
export const POST = withErrorCapture('aria/competitor-watches', _POST)
export const DELETE = withErrorCapture('aria/competitor-watches', _DELETE)
