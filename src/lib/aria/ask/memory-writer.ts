import { supabaseAdmin } from '@/lib/supabase-admin'

const MEMORY_TRIGGERS = [
  { pattern: /we (open|close|operate|trade) (at|from|until|between)/i, kind: 'business_fact', topic: 'hours' },
  { pattern: /our (best|busiest|quietest) (day|time|period)/i, kind: 'pattern', topic: 'trading_patterns' },
  { pattern: /our (main|primary|biggest) (supplier|customer|product)/i, kind: 'business_fact', topic: 'key_relationships' },
  { pattern: /we (charge|price|sell) .* for \$[\d.]+/i, kind: 'business_fact', topic: 'pricing' },
  { pattern: /(don't|do not|never) (want|like|need)/i, kind: 'preference', topic: 'owner_preferences' },
  { pattern: /we're (planning|going to|about to|thinking of)/i, kind: 'intent', topic: 'upcoming_plans' },
  { pattern: /our target|we want to|our goal/i, kind: 'goal', topic: 'business_goals' },
]

export async function maybeWriteMemory(
  businessId: string,
  userMessage: string,
  _assistantResponse: string,
): Promise<void> {
  for (const trigger of MEMORY_TRIGGERS) {
    if (!trigger.pattern.test(userMessage)) continue

    const sentences = userMessage.split(/[.!?]/).filter(s => trigger.pattern.test(s))
    if (sentences.length === 0) continue
    const content = sentences[0].trim()
    if (content.length < 10) continue

    const { data: existing } = await supabaseAdmin
      .from('aria_business_memory')
      .select('id')
      .eq('business_id', businessId)
      .eq('kind', trigger.kind)
      .eq('topic', trigger.topic)
      .eq('is_active', true)
      .ilike('content', '%' + content.slice(0, 30) + '%')
      .maybeSingle()

    if (!existing) {
      void supabaseAdmin.from('aria_business_memory').insert({
        business_id: businessId,
        kind: trigger.kind,
        topic: trigger.topic,
        content,
        importance: 7,
        confidence: 0.70,
        source: 'ask_aria_conversation',
        source_type: 'conversation',
        is_active: true,
      })
    }
  }
}
