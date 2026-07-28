import { createClient } from '@supabase/supabase-js'
import { createDecision } from '@/lib/decisions/createDecision'

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
  } catch (e) { console.error('[aria/brain] isTracking failed:', e); return true }
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
  } catch (e) { console.error('[aria/brain] logActivity failed:', e) }
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
      businessId: obs.business_id,
    })

    const { parseLLMJsonOr } = await import('@/lib/ai-json')
    const insight = parseLLMJsonOr<{ title?: string; description?: string; priority?: string; estimated_impact?: string; suggested_action?: string }>(
      text,
      {},
      'aria-brain/ariaObserve'
    )

    if (!insight.title || !insight.description) return

    const supabase = getSupabase()
    const rawPriority = String(insight.priority ?? '')
    const mappedPriority: 'urgent' | 'important' | 'routine' =
      rawPriority === 'urgent' || rawPriority === 'critical' || rawPriority === 'high' ? 'urgent'
      : rawPriority === 'medium' || rawPriority === 'important' ? 'important'
      : 'routine'
    // SPINE-1 — identical row, now also emitting the 'proposed' moat event + real-time push.
    await createDecision({
      business_id: obs.business_id,
      domain: 'growth',
      kind: 'brain_observation',
      category: obs.category,
      priority: mappedPriority,
      title: insight.title,
      subtitle: insight.description,
      payload: { ...obs.data, suggested_action: insight.suggested_action ?? null },
      estimated_impact: insight.estimated_impact ?? null,
    })
  } catch (e) { console.error('[aria/brain] ariaObserve failed (non-fatal):', e) }
}