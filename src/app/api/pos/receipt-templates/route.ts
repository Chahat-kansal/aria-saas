export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getBiz(supabase: any, userId: string) {
  const { data } = await supabase.from('businesses').select('id')
    .eq('user_id', userId).eq('is_active', true)
    .order('created_at').limit(1).maybeSingle()
  return data
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const { data, error } = await supabase.from('pos_receipt_templates')
    .select('*').eq('business_id', biz.id).order('created_at', { ascending: false })
  if (error?.code === '42P01') return NextResponse.json({ templates: [] })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data || [] })
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const body = await req.json()
  const { data, error } = await supabase.from('pos_receipt_templates').insert({
    business_id: biz.id,
    name: body.name || 'New Receipt',
    type: body.type || 'normal',
    for_type: body.for_type || 'sale',
    components: body.components || [],
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const body = await req.json()
  const { id, business_id: _bid, ...updates } = body
  const { data, error } = await supabase.from('pos_receipt_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id).eq('business_id', biz.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('pos_receipt_templates')
    .delete().eq('id', id).eq('business_id', biz.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
