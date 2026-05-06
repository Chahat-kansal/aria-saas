export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// Identical pattern to all working POS routes (promotions, products, customers, etc.)
async function getBid(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string
): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (active?.business_id) return active.business_id as string

  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase.from('pos_receipt_templates')
      .select('*').eq('id', params.id).maybeSingle()
    if (error?.code === '42P01') return NextResponse.json({ template: null })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ template: data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('[receipt-templates GET]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    // Exact same client + auth + bid pattern as promotions/route.ts, products/route.ts, etc.
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const bid = await getBid(supabase, user.id)
    if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 404 })

    const id = params.id
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Only update columns that were sent AND confirmed to exist in the table:
    // id, business_id, name, type, for_type, components, created_at,
    // canvas_width, canvas_height, background_color, elements, is_default
    // Note: updated_at does NOT exist in this table — never include it
    const update: Record<string, unknown> = {}

    if (body.name             !== undefined) update.name             = String(body.name)
    if (body.elements         !== undefined) update.elements         = body.elements
    if (body.canvas_width     !== undefined) update.canvas_width     = Number(body.canvas_width)
    if (body.canvas_height    !== undefined) update.canvas_height    = Number(body.canvas_height)
    if (body.background_color !== undefined) update.background_color = String(body.background_color)
    if (body.is_default       !== undefined) update.is_default       = Boolean(body.is_default)
    if (body.components       !== undefined) update.components       = body.components
    // type and for_type excluded: 'type' is a Postgres reserved word

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    console.log('[PATCH receipt] id:', id, 'bid:', bid, 'fields:', Object.keys(update))

    const { data, error } = await supabase
      .from('pos_receipt_templates')
      .update(update)
      .eq('id', id)
      .eq('business_id', bid)
      .select('id, name, elements, canvas_width, canvas_height, background_color, is_default')
      .single()

    if (error) {
      console.error('[PATCH receipt] supabase error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Template not found or does not belong to this business' },
        { status: 404 }
      )
    }

    return NextResponse.json(data)

  } catch (err: unknown) {
    const e = err as { message?: string; code?: string }
    console.error('[PATCH receipt] caught:', { message: e?.message, code: e?.code })
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
