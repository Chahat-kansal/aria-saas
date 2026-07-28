import type { SupabaseClient } from '@supabase/supabase-js'
import { DOMAIN_LABELS } from '@/app/owner/theme'

export interface ChatAction {
  type: 'create_job' | 'open_decision'
  label: string
  /** create_job: the ask to hand to PH-2. open_decision: the real decision id to deep-link to. */
  payload: { ask?: string; decision_id?: string }
}

export interface SuggestedChip {
  label: string
  question: string
}

// OWNER-APP PH-3 — actions are DERIVED from the answer plus REAL linked records. The rule the brief
// sets (and this file enforces): never surface an action with no backing record. An "open the
// decision" chip is emitted ONLY when a live waiting decision actually matches the exchange — so a
// tap can never land on a record that doesn't exist.
//
// Matching is deliberately conservative and lexical (no extra LLM call, no invented linkage): a
// waiting decision matches when meaningful words from its own title/kind appear in the question or
// the answer. If nothing matches, no open_decision action is returned — an honest empty, not a guess.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'is', 'are', 'was', 'were',
  'this', 'that', 'these', 'those', 'my', 'your', 'our', 'it', 'be', 'can', 'do', 'does', 'how',
  'what', 'when', 'where', 'why', 'next', 'week', 'day', 'new', 'due', 'run', 'all', 'any', 'get',
])

function meaningfulTokens(text: string): string[] {
  return Array.from(new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 4 && !STOPWORDS.has(w)),
  ))
}

export async function deriveChatActions(
  supabase: SupabaseClient,
  business_id: string,
  question: string,
  answer: string,
): Promise<ChatAction[]> {
  const actions: ChatAction[] = []
  const haystack = (question + ' ' + answer).toLowerCase()

  const { data: waiting } = await supabase
    .from('aria_autopilot_actions')
    .select('id, title, kind, domain')
    .eq('business_id', business_id)
    .eq('status', 'pending')
    .limit(50)

  for (const d of (waiting ?? []) as Array<{ id: string; title: string | null; kind: string | null; domain: string | null }>) {
    const tokens = meaningfulTokens([d.title ?? '', (d.kind ?? '').replace(/_/g, ' ')].join(' '))
    if (tokens.length === 0) continue
    const hits = tokens.filter(t => haystack.includes(t)).length
    // Require 2 matching content words (or 1 when the decision's own title is that short) so a
    // single incidental word can't mis-link an unrelated decision.
    if (hits >= Math.min(2, tokens.length)) {
      actions.push({
        type: 'open_decision',
        label: 'Open the ' + (d.domain ? DOMAIN_LABELS[d.domain]?.toLowerCase() + ' ' : '') + 'decision',
        payload: { decision_id: d.id },
      })
      break // one decision link per answer — the phone shows a single clear next step, not a list
    }
  }

  // "Turn this into a job" is always legitimate: it hands the owner's OWN question to PH-2 as the
  // job's ask, so the backing record is the question itself — nothing derived or invented.
  actions.push({ type: 'create_job', label: 'Turn this into a job', payload: { ask: question } })

  return actions
}

// Chips must map to questions the grounded brain can actually answer for THIS business — the brief
// is explicit that no chip may lead to "I don't know". Each candidate below is gated on the real
// data it needs actually existing (sales rows, waiting decisions, staff, low stock), checked
// cheaply with head:true counts. A business with no sales never sees a revenue chip.
export async function buildSuggestedChips(supabase: SupabaseClient, business_id: string): Promise<SuggestedChip[]> {
  const [salesRes, decisionsRes, staffRes, productsRes] = await Promise.all([
    supabase.from('pos_sales').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).eq('status', 'completed'),
    supabase.from('aria_autopilot_actions').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).eq('status', 'pending'),
    supabase.from('staff_members').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id),
    supabase.from('pos_products').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).eq('is_active', true),
  ])

  const chips: SuggestedChip[] = []
  if ((salesRes.count ?? 0) > 0) {
    chips.push({ label: 'How are we tracking this month?', question: 'How are we tracking this month?' })
    chips.push({ label: 'How was yesterday?', question: 'How did we do yesterday?' })
  }
  if ((productsRes.count ?? 0) > 0) {
    chips.push({ label: "What's low?", question: 'What stock is running low right now?' })
  }
  if ((decisionsRes.count ?? 0) > 0) {
    chips.push({ label: 'What needs me today?', question: 'What decisions are waiting on me right now?' })
  }
  if ((salesRes.count ?? 0) > 0 && (staffRes.count ?? 0) > 0) {
    chips.push({ label: 'Can I afford another part-timer?', question: 'Based on my revenue and current labour cost, can I afford another part-timer?' })
  }

  return chips
}
