export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ preferences: [] })

  const { data } = await supabase
    .from('aria_tracking_preferences')
    .select('id, category, is_tracking, paused_reason, paused_at')
    .eq('business_id', bid)
    .order('category')

  return NextResponse.json({ preferences: data ?? [] })
}

export const GET = withErrorCapture('aria/tracking-preferences', _GET)

async function _PATCH(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { category, is_tracking, paused_reason } = await req.json()
  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })

  const payload: Record<string, unknown> = {
    business_id: bid,
    category,
    is_tracking: !!is_tracking,
    updated_at: new Date().toISOString(),
  }
  if (!is_tracking && paused_reason) {
    payload.paused_reason = paused_reason
    payload.paused_at = new Date().toISOString()
  } else if (is_tracking) {
    payload.paused_reason = null
    payload.paused_at = null
  }

  const { error } = await supabase
    .from('aria_tracking_preferences')
    .upsert(payload, { onConflict: 'business_id,category' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withBusinessContext('aria/tracking-preferences', _PATCH)