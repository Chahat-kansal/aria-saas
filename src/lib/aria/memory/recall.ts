import { supabaseAdmin } from '@/lib/supabase-admin'

// IMPORTANT: every reader of aria_business_memory MUST filter on both
// is_active=true AND deleted_at IS NULL. Soft-archived rows leak to the
// council otherwise. See PUSHBACK-AUDIT-1 (+ erratum) for the filter-parity RCA.

export interface RecalledMemory {
  kind: string
  content: string
  topic: string | null
  importance: number
  age_days: number
}

export interface ConversationSummary {
  conversation_date: string
  summary: string
  key_decisions: string[]
  key_concerns: string[]
  followup_promised: string[]
}

const TOPIC_KEYWORDS: Record<string, string[]> = {
  pricing: ['price', 'cost', 'margin', 'discount', 'charge'],
  staff: ['staff', 'labour', 'roster', 'hours', 'shift', 'employee'],
  inventory: ['stock', 'inventory', 'product', 'order', 'supplier'],
  customers: ['customer', 'loyalty', 'churn', 'winback', 'regular'],
  cashflow: ['cash', 'payment', 'invoice', 'expense', 'revenue'],
  marketing: ['marketing', 'promotion', 'campaign', 'sms', 'social'],
}

export async function recallMemories(
  businessId: string,
  question: string,
  limit = 12
): Promise<RecalledMemory[]> {
  try {
    const { data } = await supabaseAdmin
      .from('aria_business_memory')
      .select('kind, content, topic, importance, confidence, created_at')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .gte('confidence', 0.6)
      .order('importance', { ascending: false })
      .limit(limit * 3)

    if (!data || data.length === 0) return []

    const qLower = question.toLowerCase()

    const scored = (data as Array<{ kind: string; content: string; topic: string | null; importance: number; created_at: string }>).map(m => {
      let score = m.importance
      if (m.topic) {
        const keywords = TOPIC_KEYWORDS[m.topic] ?? []
        if (keywords.some(k => qLower.includes(k))) score += 3
      }
      if (m.importance >= 9) score += 5
      return { ...m, _score: score }
    })

    scored.sort((a, b) => b._score - a._score)

    return scored.slice(0, limit).map(m => ({
      kind: m.kind,
      content: m.content,
      topic: m.topic,
      importance: m.importance,
      age_days: Math.round((Date.now() - new Date(m.created_at).getTime()) / 86400000),
    }))
  } catch {
    return []
  }
}

export function formatMemoriesForPrompt(memories: RecalledMemory[]): string {
  if (memories.length === 0) return ''

  const grouped: Record<string, RecalledMemory[]> = {}
  for (const m of memories) {
    if (!grouped[m.kind]) grouped[m.kind] = []
    grouped[m.kind].push(m)
  }

  const lines: string[] = ['OWNER MEMORY (what Aria knows about this business from past conversations):']

  // PATTERN-MEMORY-1 (I3): durable SQL-detected data patterns first (highest-value, capped at 5 to
  // avoid token bloat); ordered by importance via the upstream recall sort. RECALL-PARITY-1 filters
  // (is_active=true AND deleted_at IS NULL) are applied upstream — unchanged.
  if (grouped.pattern) lines.push('DATA PATTERNS (detected from your sales — durable, data-grounded intelligence): ' + grouped.pattern.slice(0, 5).map(m => m.content).join(' | '))
  if (grouped.fact) lines.push('Facts: ' + grouped.fact.map(m => m.content).join(' | '))
  if (grouped.preference) lines.push('Owner preferences: ' + grouped.preference.map(m => m.content).join(' | '))
  if (grouped.goal) lines.push('Goals: ' + grouped.goal.map(m => m.content).join(' | '))
  if (grouped.concern) lines.push('Ongoing concerns: ' + grouped.concern.map(m => m.content).join(' | '))
  if (grouped.decision) lines.push('Past decisions: ' + grouped.decision.map(m => m.content).join(' | '))
  if (grouped.tried) lines.push('Things tried: ' + grouped.tried.map(m => m.content).join(' | '))

  lines.push('Use this context to personalise advice. Reference past decisions when relevant. Never re-recommend something the owner already dismissed.')

  return lines.join('\n')
}

export async function fetchRecentSummaries(
  businessId: string,
  days = 7
): Promise<ConversationSummary[]> {
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const { data } = await supabaseAdmin
      .from('aria_conversation_summaries')
      .select('conversation_date, summary, key_decisions, key_concerns, followup_promised')
      .eq('business_id', businessId)
      .gte('conversation_date', since)
      .order('conversation_date', { ascending: false })
      .limit(5)

    return (data ?? []) as ConversationSummary[]
  } catch {
    return []
  }
}

export function formatSummariesForPrompt(summaries: ConversationSummary[]): string {
  if (summaries.length === 0) return ''

  const lines: string[] = ['RECENT CONVERSATIONS (last 7 days):']

  for (const s of summaries) {
    let line = s.conversation_date + ': ' + s.summary
    if (s.key_decisions?.length) line += ' Decisions: ' + s.key_decisions.join(', ')
    if (s.followup_promised?.length) line += ' Aria promised to check: ' + s.followup_promised.join(', ')
    lines.push(line)
  }

  lines.push('If there are open follow-ups from these conversations, mention them briefly if relevant to the current question.')

  return lines.join('\n')
}
