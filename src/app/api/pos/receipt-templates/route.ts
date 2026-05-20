export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const { searchParams } = new URL(req.url)
  const outletId = searchParams.get('outlet_id')
  let query = supabase.from('pos_receipt_templates').select('*').eq('business_id', bid).order('created_at', { ascending: false })
  if (outletId) query = query.eq('outlet_id', outletId)
  const { data, error } = await query
  if (error?.code === '42P01') return NextResponse.json({ templates: [] })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data || [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const body = await req.json()
  const tname = String(body.template_name ?? body.name ?? 'Default')
  const payload: Record<string, unknown> = {
    business_id: bid,
    name: tname,           // required NOT NULL in original schema
    template_name: tname,  // used by canvas editor
    width_mm: [58, 76, 80, 112].includes(Number(body.width_mm)) ? Number(body.width_mm) : 80,
    header_text: body.header_text ?? null,
    footer_text: body.footer_text ?? null,
    logo_url: body.logo_url ?? null,
    show_tax_breakdown: body.show_tax_breakdown ?? false,
    show_qr_code: body.show_qr_code ?? false,
    show_loyalty_balance: body.show_loyalty_balance ?? false,
    paper_cut_mode: ['full', 'partial', 'none'].includes(body.paper_cut_mode) ? body.paper_cut_mode : 'partial',
    type: body.type ?? 'standard',
    for_type: body.for_type ?? 'sale',
    is_default: body.is_default ?? false,
    elements: body.elements ?? [],
  }
  if (body.outlet_id) payload.outlet_id = body.outlet_id
  const { data, error } = await supabase.from('pos_receipt_templates').insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data }, { status: 201 })
}

export const GET = withErrorCapture('pos/receipt-templates', _GET)
export const POST = withErrorCapture('pos/receipt-templates', _POST)
