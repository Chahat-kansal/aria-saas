import { callAnthropic } from '@/lib/aria/providers/anthropic'

// CX-0 cold-start AI feed cards. Grounded by construction: every card is built from REAL POS signals
// passed in (busy/promo/fresh). Haiku only re-phrases those facts; a deterministic template is the
// guaranteed fallback, and any Haiku output that introduces a number not in the facts is rejected.
// If a business has no real signal, it produces NO card (no filler / no invented "busy now").

export interface BizSignal {
  business_id: string
  name: string
  busy_2h: number                  // completed sales in the last 2h
  promo_name: string | null        // live promotion name
  fresh_product_name: string | null // product added in the last 24h
  logo_url: string | null
}

export interface ColdStartCard {
  id: string
  ai_card: true
  card_text: string
  business: { name: string | null; logo_url: string | null } | null
}

function hasSignal(s: BizSignal): boolean {
  return s.busy_2h >= 3 || !!s.promo_name || !!s.fresh_product_name
}

// Deterministic grounded sentence (also the LLM fallback). Only states figures present on the signal.
function templateFor(s: BizSignal): string {
  if (s.busy_2h >= 3) return `${s.name} is busy right now — ${s.busy_2h} sales in the last 2 hours.`
  if (s.promo_name) return `${s.name} has a live offer on: ${s.promo_name}.`
  return `${s.name} just added ${s.fresh_product_name} — fresh in the last 24 hours.`
}

// Reject any Haiku copy that contains a number not in the allowed set (the only real figure is busy_2h).
function numericallyGrounded(text: string, s: BizSignal): boolean {
  const allowed = new Set<string>()
  if (s.busy_2h >= 3) allowed.add(String(s.busy_2h))
  return (text.match(/\d+/g) ?? []).every(n => allowed.has(n))
}

export async function generateColdStartCards(signals: BizSignal[]): Promise<ColdStartCard[]> {
  const grounded = signals.filter(hasSignal).slice(0, 6)
  if (grounded.length === 0) return []

  const text: Record<string, string> = {}
  for (const s of grounded) text[s.business_id] = templateFor(s)

  // Haiku re-phrasing — uses ONLY the supplied figures; falls back to the template on any failure.
  try {
    const facts = grounded.map(s => ({
      business_id: s.business_id, name: s.name,
      sales_last_2h: s.busy_2h >= 3 ? s.busy_2h : null,
      live_offer: s.promo_name, new_product_24h: s.fresh_product_name,
    }))
    const { data } = await callAnthropic<{ cards: Array<{ business_id: string; text: string }> }>(
      {
        model: 'haiku', agentKey: 'generic', role: 'narrative', maxTokens: 300, timeoutMs: 8000,
        systemPrompt:
          'You write ONE short, warm local-community feed blurb per business (max 18 words). Use ONLY the ' +
          'numbers and names provided — NEVER invent, round, or change a figure. If a field is null, do not ' +
          'mention it. No emojis. Return JSON: {"cards":[{"business_id":"...","text":"..."}]}.',
        userPrompt: JSON.stringify({ businesses: facts }),
      },
      { cards: [] },
    )
    for (const c of (data.cards ?? [])) {
      const s = grounded.find(g => g.business_id === c.business_id)
      if (s && typeof c.text === 'string' && c.text.trim() && numericallyGrounded(c.text, s)) {
        text[s.business_id] = c.text.trim().slice(0, 140)
      }
    }
  } catch { /* keep templated fallback */ }

  return grounded.slice(0, 3).map(s => ({
    id: `aicard:${s.business_id}`,
    ai_card: true as const,
    card_text: text[s.business_id],
    business: { name: s.name, logo_url: s.logo_url },
  }))
}
