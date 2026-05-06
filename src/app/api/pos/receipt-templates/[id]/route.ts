export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

async function getBizId(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase
    .from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase
    .from('businesses').select('id').eq('user_id', userId).eq('is_active', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('pos_receipt_templates')
    .select('*').eq('id', params.id).maybeSingle()
  if (error?.code === '42P01') return NextResponse.json({ template: null })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get the user's business so we can filter the update explicitly
  // (more reliable than relying solely on RLS)
  const bizId = await getBizId(supabase, user.id)
  if (!bizId) return NextResponse.json({ error: 'No business found' }, { status: 400 })

  const body = await req.json().catch(() => ({}))

  // Build the update payload — only include fields that were sent
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name           !== undefined) update.name           = body.name
  if (body.type           !== undefined) update.type           = body.type
  if (body.for_type       !== undefined) update.for_type       = body.for_type
  if (body.components     !== undefined) update.components     = body.components
  if (body.is_default     !== undefined) update.is_default     = body.is_default
  if (body.elements       !== undefined) update.elements       = body.elements
  if (body.canvas_height  !== undefined) update.canvas_height  = body.canvas_height
  if (body.canvas_width   !== undefined) update.canvas_width   = body.canvas_width
  if (body.background_color !== undefined) update.background_color = body.background_color

  // When marking as default, unset all others for this business first
  if (body.is_default === true) {
    await supabase.from('pos_receipt_templates')
      .update({ is_default: false })
      .eq('business_id', bizId)
      .neq('id', params.id)
  }

  // Use maybeSingle() — returns null instead of erroring when 0 rows affected
  const { data, error } = await supabase.from('pos_receipt_templates')
    .update(update)
    .eq('id', params.id)
    .eq('business_id', bizId)
    .select()
    .maybeSingle()

  if (error?.code === '42703') {
    // One or more canvas columns don't exist yet — save core fields only
    const safe: Record<string, unknown> = { updated_at: update.updated_at }
    for (const k of ['name', 'type', 'for_type', 'components', 'is_default']) {
      if (update[k] !== undefined) safe[k] = update[k]
    }
    const { data: d2, error: e2 } = await supabase.from('pos_receipt_templates')
      .update(safe).eq('id', params.id).eq('business_id', bizId).select().maybeSingle()
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
    if (!d2) return NextResponse.json({ error: 'Template not found or access denied' }, { status: 404 })
    return NextResponse.json({ template: d2, migration_needed: true })
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Template not found or access denied' }, { status: 404 })
  return NextResponse.json({ template: data })
}
