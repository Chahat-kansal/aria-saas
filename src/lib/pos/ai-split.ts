import Anthropic from '@anthropic-ai/sdk'
import { parseLLMJsonOr } from '@/lib/ai-json'

export interface SaleItemForSplit {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface SplitMember {
  name: string
  dietary_preferences?: string
  role?: string
}

export interface GroupHistoryEntry {
  member_name: string
  past_items: string[]
  avg_tip_pct?: number
}

export interface AISplitPerson {
  person: string
  items: string[]      // sale_item_ids
  subtotal: number
  tip_suggestion: number
  total: number
  reasoning: string
}

export interface AISplitResponse {
  splits: AISplitPerson[]
  overall_reasoning: string
  confidence: number
}

const FALLBACK: AISplitResponse = { splits: [], overall_reasoning: 'Unable to suggest split', confidence: 0 }

export async function suggestSplit(
  saleItems: SaleItemForSplit[],
  members: SplitMember[],
  groupHistory?: GroupHistoryEntry[],
  saleTotal?: number,
): Promise<AISplitResponse> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const itemList = saleItems.map(i => `  [${i.id}] ${i.product_name} x${i.quantity} @ A$${i.unit_price} = A$${i.line_total}`).join('\n')
  const memberList = members.map(m => `  ${m.name}${m.dietary_preferences ? ` (${m.dietary_preferences})` : ''}${m.role ? ` [${m.role}]` : ''}`).join('\n')
  const historySection = groupHistory?.length
    ? `\nGroup history:\n${groupHistory.map(h => `  ${h.member_name}: usually orders ${h.past_items.slice(0, 3).join(', ')}${h.avg_tip_pct ? `, avg tip ${h.avg_tip_pct}%` : ''}`).join('\n')}`
    : ''

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      system: `You are an AI bill-splitter for an Australian cafe/restaurant POS. Given sale items and a list of people, propose a fair split. Consider:
- Items each person likely ordered (use dietary preferences and historical patterns)
- Shared items (appetizers, drinks for the table) split evenly
- Different tipping habits if known from history
- Australian A$ currency
Respond with valid JSON only. No prose before or after. No code fences.
Schema: {"splits":[{"person":"name","items":["sale_item_id"],"subtotal":0.00,"tip_suggestion":0.00,"total":0.00,"reasoning":"1 sentence"}],"overall_reasoning":"string","confidence":0.9}`,
      messages: [{
        role: 'user',
        content: `Sale items:\n${itemList}\n\nPeople:\n${memberList}${historySection}\n\nActual sale total to split: A$${(saleTotal ?? saleItems.reduce((s, i) => s + (Number(i.line_total) || 0), 0)).toFixed(2)}\n\nIMPORTANT: The sum of all splits' "total" fields MUST equal the actual sale total exactly. Assign the last person any rounding remainder. Return JSON only.`,
      }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const result = parseLLMJsonOr<AISplitResponse>(raw, FALLBACK, 'ai-split')

    // Force splits to sum to exact sale total
    if (result.splits.length > 0 && saleTotal && saleTotal > 0) {
      const assignedTotal = result.splits.reduce((s, sp) => s + (Number(sp.total) || 0), 0)
      const diff = Math.round((saleTotal - assignedTotal) * 100) / 100
      if (Math.abs(diff) > 0.001) {
        const last = result.splits[result.splits.length - 1]
        last.total = Math.round((Number(last.total) + diff) * 100) / 100
        last.subtotal = Math.round((Number(last.subtotal) + diff) * 100) / 100
      }
    }

    return result
  } catch {
    return FALLBACK
  }
}