export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

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

  const body = await req.json()

  // Core columns — always exist
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name        !== undefined) update.name        = body.name
  if (body.type        !== undefined) update.type        = body.type
  if (body.for_type    !== undefined) update.for_type    = body.for_type
  if (body.components  !== undefined) update.components  = body.components
  if (body.is_default  !== undefined) update.is_default  = body.is_default

  // Canvas v2 columns (added by migration 20260510000003)
  // Include them only when provided — if the column doesn't exist Postgres
  // returns error code 42703 and we fall back to saving without them.
  if (body.elements          !== undefined) update.elements          = body.elements
  if (body.canvas_height     !== undefined) update.canvas_height     = body.canvas_height
  if (body.canvas_width      !== undefined) update.canvas_width      = body.canvas_width
  if (body.background_color  !== undefined) update.background_color  = body.background_color

  const { data, error } = await supabase.from('pos_receipt_templates')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error?.code === '42703') {
    // Column doesn't exist yet — migration 20260510000003 not run.
    // Fall back to saving only the core fields.
    const safe: Record<string, unknown> = { updated_at: update.updated_at }
    for (const k of ['name', 'type', 'for_type', 'components', 'is_default']) {
      if (update[k] !== undefined) safe[k] = update[k]
    }
    const { data: d2, error: e2 } = await supabase.from('pos_receipt_templates')
      .update(safe).eq('id', params.id).select().single()
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
    return NextResponse.json({ template: d2, migration_needed: true })
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}
