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

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (body.template_name    !== undefined) update.template_name    = String(body.template_name)
  if (body.width_mm         !== undefined && [58, 76, 80, 112].includes(Number(body.width_mm))) update.width_mm = Number(body.width_mm)
  if (body.header_text      !== undefined) update.header_text      = body.header_text
  if (body.footer_text      !== undefined) update.footer_text      = body.footer_text
  if (body.logo_url         !== undefined) update.logo_url         = body.logo_url
  if (body.show_tax_breakdown !== undefined) update.show_tax_breakdown = Boolean(body.show_tax_breakdown)
  if (body.show_qr_code     !== undefined) update.show_qr_code     = Boolean(body.show_qr_code)
  if (body.show_loyalty_balance !== undefined) update.show_loyalty_balance = Boolean(body.show_loyalty_balance)
  if (body.paper_cut_mode   !== undefined && ['full', 'partial', 'none'].includes(body.paper_cut_mode)) update.paper_cut_mode = body.paper_cut_mode
  if (body.outlet_id        !== undefined) update.outlet_id        = body.outlet_id
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  const { data, error } = await supabase.from('pos_receipt_templates').update(update).eq('id', params.id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ template: data })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const { error } = await supabase.from('pos_receipt_templates').delete().eq('id', params.id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('pos/receipt-templates/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/receipt-templates/[id]', _DELETE)
