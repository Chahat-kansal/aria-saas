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

  const { data: rows } = await supabase
    .from('aria_actions')
    .select('id, category, priority, title, recommendation, expected_impact, status, created_at')
    .eq('business_id', bid)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20)

  // Sort: high → medium → low; remap column names to what the panel expects
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const insights = (rows ?? [])
    .sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3))
    .map(r => ({
      id: r.id,
      category: r.category,
      priority: r.priority,
      title: r.title,
      description: r.recommendation,       // aria_actions uses 'recommendation'
      estimated_impact: r.expected_impact,  // aria_actions uses 'expected_impact'
      status: r.status,
      created_at: r.created_at,
    }))

  return NextResponse.json({ insights })
}

export const GET = withErrorCapture('aria/pending-insights', _GET)