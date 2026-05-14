export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

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
  if (!bid) return NextResponse.json({ insights: [] })

  const { data: insights } = await supabase
    .from('aria_autopilot_actions')
    .select('id, category, priority, title, description, estimated_impact, status, created_at')
    .eq('business_id', bid)
    .eq('status', 'pending')
    .order('priority', { ascending: true }) // high < low alphabetically, use created_at fallback
    .order('created_at', { ascending: false })
    .limit(20)

  // Sort: high → medium → low
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const sorted = (insights ?? []).sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3))

  return NextResponse.json({ insights: sorted })
}

export const GET = withErrorCapture('aria/pending-insights', _GET)