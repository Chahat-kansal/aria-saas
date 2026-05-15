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

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return // skip if Claude not configured

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: `You are Aria, a silent business intelligence brain for an Australian small business.
Observe business events and generate ONE actionable insight. Be specific and concise.
Respond ONLY with valid JSON: {"title":"","description":"","priority":"critical|high|medium|low","estimated_impact":""}`,
        messages: [{
          role: 'user',
          content: `Business event:\nCategory: ${obs.category}\nEvent: ${obs.event_type}\nData: ${JSON.stringify(obs.data)}\nTriggered by: ${obs.triggered_by ?? 'system'}\n\nGenerate ONE insight.`
        }]
      })
    })

    if (!response.ok) return

    const result = await response.json() as { content?: Array<{ text?: string }> }
    const text = result.content?.[0]?.text ?? ''

    let insight: { title?: string; description?: string; priority?: string; estimated_impact?: string }
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
      action_data: obs.data,
      estimated_impact: insight.estimated_impact ?? null,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
  } catch { /* non-fatal — never blocks a sale */ }
}