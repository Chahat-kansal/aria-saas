export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

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
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get the user's business — single query is more reliable than getBizId
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!biz) return NextResponse.json({ error: 'No business found' }, { status: 404 })

    // Verify the template belongs to this business before updating
    const { data: existing } = await supabase
      .from('pos_receipt_templates')
      .select('id, business_id')
      .eq('id', params.id)
      .eq('business_id', biz.id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))

    // When marking as default, unset all others first
    if (body.is_default === true) {
      await supabase.from('pos_receipt_templates')
        .update({ is_default: false })
        .eq('business_id', biz.id)
        .neq('id', params.id)
    }

    // Build update — only include fields that were sent
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.name              !== undefined) update.name              = body.name
    if (body.is_default        !== undefined) update.is_default        = body.is_default
    if (body.components        !== undefined) update.components        = body.components
    if (body.elements          !== undefined) update.elements          = body.elements
    if (body.canvas_height     !== undefined) update.canvas_height     = body.canvas_height
    if (body.canvas_width      !== undefined) update.canvas_width      = body.canvas_width
    if (body.background_color  !== undefined) update.background_color  = body.background_color
    // legacy fields
    if (body.type              !== undefined) update.type              = body.type
    if (body.for_type          !== undefined) update.for_type          = body.for_type
    if (body.template_data     !== undefined) update.template_data     = body.template_data
    if (body.settings          !== undefined) update.settings          = body.settings

    const { data, error } = await supabase
      .from('pos_receipt_templates')
      .update(update)
      .eq('id', params.id)
      .eq('business_id', biz.id)
      .select()
      .single()

    if (error) {
      // Column doesn't exist yet — save only proven-safe fields
      if (error.code === '42703' || error.message?.includes('column')) {
        const safe: Record<string, unknown> = { updated_at: update.updated_at }
        for (const k of ['name', 'is_default', 'type', 'for_type', 'components', 'template_data', 'settings']) {
          if (update[k] !== undefined) safe[k] = update[k]
        }
        const { data: safeData, error: safeErr } = await supabase
          .from('pos_receipt_templates')
          .update(safe)
          .eq('id', params.id)
          .eq('business_id', biz.id)
          .select()
          .single()

        if (safeErr) throw new Error(safeErr.message)

        // Log migration SQL so owner can run it
        const migrationSql = [
          'ALTER TABLE pos_receipt_templates',
          '  ADD COLUMN IF NOT EXISTS canvas_width integer DEFAULT 302,',
          '  ADD COLUMN IF NOT EXISTS canvas_height integer DEFAULT 800,',
          "  ADD COLUMN IF NOT EXISTS background_color text DEFAULT '#ffffff',",
          "  ADD COLUMN IF NOT EXISTS elements jsonb DEFAULT '[]',",
          '  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;',
        ].join('\n')
        console.warn('[receipt-templates] Run this SQL in Supabase SQL Editor:\n', migrationSql)

        return NextResponse.json({
          ...safeData,
          _migration_needed: true,
          _migration_sql: migrationSql,
        })
      }
      throw new Error(error.message)
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('[receipt-templates PATCH]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
