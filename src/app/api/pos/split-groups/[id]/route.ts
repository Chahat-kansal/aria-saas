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

async function _GET(_req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const [{ data: group }, { data: members }, { data: ious }] = await Promise.all([
    supabase.from('split_groups').select('*').eq('id', id).eq('business_id', bid ?? '').maybeSingle(),
    supabase.from('split_group_members').select('*').eq('group_id', id).eq('is_active', true).order('name'),
    supabase.from('split_ious').select('*').eq('group_id', id).in('status', ['pending', 'disputed']).order('created_at', { ascending: false }).limit(20),
  ])
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ group, members: members ?? [], open_ious: ious ?? [] })
}

async function _PATCH(req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const body = await req.json()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name) update.name = body.name
  if (body.description !== undefined) update.description = body.description

  const { error: e } = await supabase.from('split_groups').update(update).eq('id', id).eq('business_id', bid ?? '')
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function _DELETE(_req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const { error: e } = await supabase.from('split_groups').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', bid ?? '')
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/split-groups/[id]', _GET)
export const PATCH = withErrorCapture('pos/split-groups/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/split-groups/[id]', _DELETE)