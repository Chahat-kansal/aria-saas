export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
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
  if (!bid) return NextResponse.json({ templates: [] })
  const { data } = await supabaseAdmin.from('pos_shelf_ticket_templates').select('*').eq('business_id', bid).order('created_at', { ascending: false })
  return NextResponse.json({ templates: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json() as Record<string, unknown>
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('pos_shelf_ticket_templates').insert({
    business_id: bid,
    name: String(body.name),
    width_mm: body.width_mm ?? 50,
    height_mm: body.height_mm ?? 30,
    background_color: body.background_color ?? '#ffffff',
    text_color: body.text_color ?? '#000000',
    accent_color: body.accent_color ?? '#2563eb',
    band_color: body.band_color ?? '#374151',
    band_text_color: body.band_text_color ?? '#ffffff',
    band_label: body.band_label ?? 'PRICE',
    price_color: body.price_color ?? '#111827',
    layout: body.layout ?? 'standard',
    ticket_type: body.ticket_type ?? 'standard',
    paper_type: body.paper_type ?? 'label',
    corner_radius: body.corner_radius ?? 0,
    canvas_elements: body.canvas_elements ?? [],
    show_name: body.show_name ?? true,
    show_price: body.show_price ?? true,
    show_sku: body.show_sku ?? false,
    show_barcode: body.show_barcode ?? true,
    show_description: body.show_description ?? false,
    show_logo: body.show_logo ?? true,
    show_promo_band: body.show_promo_band ?? true,
    show_was_price: body.show_was_price ?? false,
    show_save_badge: body.show_save_badge ?? false,
    show_member_price: body.show_member_price ?? false,
    show_per_unit: body.show_per_unit ?? false,
    show_multibuy: body.show_multibuy ?? false,
    show_valid_date: body.show_valid_date ?? false,
    font_size_name: body.font_size_name ?? 14,
    font_size_price: body.font_size_price ?? 20,
    is_default: body.is_default ?? false,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // One default per business — unset the others.
  if (body.is_default === true && data?.id) {
    await supabaseAdmin.from('pos_shelf_ticket_templates').update({ is_default: false }).eq('business_id', bid).neq('id', data.id)
  }
  return NextResponse.json({ template: data }, { status: 201 })
}

export const GET = withErrorCapture('tickets/templates', _GET)
export const POST = withErrorCapture('tickets/templates', _POST)
