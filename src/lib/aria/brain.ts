import { createClient } from '@supabase/supabase-js'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export type AriaCategory =
  | 'sales' | 'inventory' | 'orders' | 'receipts' | 'customers'
  | 'pricing' | 'staff' | 'compliance' | 'cashflow' | 'expiry' | 'promotions'

export interface AriaObservation {
  business_id: string
  category: AriaCategory
  event_type: string
  data: Record<string, unknown>
  triggered_by?: string
}

export async function isTracking(business_id: string, category: AriaCategory): Promise<boolean> {
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('aria_tracking_preferences')
      .select('is_tracking')
      .eq('business_id', business_id)
      .eq('category', category)
      .maybeSingle()
    return data?.is_tracking !== false
  } catch { return true }
}

export async function logActivity(
  business_id: string,
  action_type: string,
  description: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = getSupabase()
    await supabase.from('activity_log').insert({
      business_id,
      action_type,
      description,
      metadata,
      created_at: new Date().toISOString(),
    })
  } catch { /* non-fatal */ }
}

export async function ariaObserve(obs: AriaObservation): Promise<void> {
  try {
    const tracking = await isTracking(obs.business_id, obs.category)
    if (!tracking) return

    const { ariaInsight } = await import('@/lib/ai-router')
    const text = await ariaInsight({
      event_type: obs.event_type,
      category: obs.category,
      data: obs.data,
      triggered_by: obs.triggered_by,
    })

    let insight: { title?: string; description?: string; priority?: string; estimated_impact?: string; suggested_action?: string }
    try {
      insight = JSON.parse(text.replace(/```json|```/g, '').trim())
    } catch { return }

    if (!insight.title || !insight.description) return

    const supabase = getSupabase()
    await supabase.from('aria_autopilot_actions').insert({
      business_id: obs.business_id,
      category: obs.category,
      priority: insight.priority ?? 'medium',
      title: insight.title,
      description: insight.description,
      action_data: { ...obs.data, suggested_action: insight.suggested_action ?? null },
      estimated_impact: insight.estimated_impact ?? null,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
  } catch { /* non-fatal — never blocks a sale */ }
}