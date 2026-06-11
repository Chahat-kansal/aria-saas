import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { AskBlock } from '@/lib/aria/ask-types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })

const SPREADSHEET_RE = /spreadsheet|\bcsv\b|excel|export/i
const CHART_RE = /\bchart\b|visuali[sz]e|graph|plot/i
const REASONING_RE = /\bwhy\b|reasoning|because|explain why/i
const DATA_RE = /how much|how many|revenue|sales|customers|orders|top|best|worst|average|total|count/i

type HealReason = 'malformed_json' | 'wrong_block_type' | 'empty_on_data_question'

async function logHeal(businessId: string, healReason: HealReason, success: boolean): Promise<void> {
  try {
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: businessId,
      agent_key: 'heal',
      provider: 'anthropic',
      model_id: 'claude-haiku-4-5-20251001',
      role: 'validator',
      success,
      request_summary: healReason,
      response_summary: success ? 'healed' : 'heal_failed',
      learning_signal: 'healed:' + healReason,
    })
  } catch { /* non-fatal */ }
}

function extractJsonBlocks(text: string): AskBlock[] | null {
  const match = text.match(/<json_blocks>([\s\S]*?)<\/json_blocks>/i)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    return Array.isArray(parsed) ? (parsed as AskBlock[]) : null
  } catch { return null }
}

function parseSingleBlock(raw: string): AskBlock | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as AskBlock
  } catch { return null }
}

export async function validateAndHeal(args: {
  userMessage: string
  blocks: AskBlock[] | null
  rawResponse: string
  pipelinePath: 'main' | 'deliverable'
  businessId: string
}): Promise<{
  blocks: AskBlock[]
  healed: boolean
  healReason?: HealReason
  healLatencyMs?: number
}> {
  const { userMessage, blocks: inputBlocks, rawResponse, pipelinePath, businessId } = args
  const blocks: AskBlock[] = inputBlocks ?? []

  // ── Check 1: Malformed JSON (main brain path only) ────────────────────────────
  // Fires when response contains <json_blocks> XML but extractBlocks returned nothing (parse error)
  if (pipelinePath === 'main' && rawResponse.includes('<json_blocks>') && blocks.length === 0) {
    const t0 = Date.now()
    try {
      const match = rawResponse.match(/<json_blocks>([\s\S]*?)<\/json_blocks>/i)
      if (match) {
        const rawText = match[1].trim()
        const res = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          temperature: 0,
          messages: [{ role: 'user', content: `The following JSON is malformed. Fix the syntax errors and return ONLY the corrected JSON array, no other text.\n\nOriginal:\n${rawText}` }],
        })
        const fixed = res.content[0].type === 'text' ? res.content[0].text.trim() : null
        if (fixed) {
          const parsed = JSON.parse(fixed)
          if (Array.isArray(parsed) && parsed.length > 0) {
            await logHeal(businessId, 'malformed_json', true)
            return { blocks: parsed as AskBlock[], healed: true, healReason: 'malformed_json', healLatencyMs: Date.now() - t0 }
          }
        }
      }
    } catch {
      await logHeal(businessId, 'malformed_json', false)
    }
  }

  // ── Check 2: Block type mismatch vs explicit user intent ──────────────────────
  // Uses rawResponse as source when blocks is empty (deliverable path passes html as rawResponse)
  const sourceContent = blocks.length > 0
    ? JSON.stringify(blocks).slice(0, 2000)
    : rawResponse.slice(0, 2000)

  const spreadsheetMissing = SPREADSHEET_RE.test(userMessage) && !blocks.some(b => b.type === 'spreadsheet') && sourceContent.length > 10
  const chartMissing = pipelinePath !== 'deliverable' && CHART_RE.test(userMessage) && !blocks.some(b => b.type === 'styled_chart' || b.type === 'chart' || b.type === 'clay_chart') && blocks.length > 0
  const reasoningMissing = pipelinePath !== 'deliverable' && REASONING_RE.test(userMessage) && !blocks.some(b => b.type === 'ai_reasoning') && blocks.length > 0

  if (spreadsheetMissing || chartMissing || reasoningMissing) {
    const t0 = Date.now()
    const prependBlocks: AskBlock[] = []
    let anyHealed = false

    if (spreadsheetMissing) {
      try {
        const res = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          temperature: 0,
          messages: [{ role: 'user', content: `User asked for a spreadsheet. Convert this content into a spreadsheet AskBlock: {"type":"spreadsheet","filename":"export.csv","headers":[...],"rows":[[...]]}. Source content: ${sourceContent}. Return ONLY a single JSON object.` }],
        })
        const raw = res.content[0].type === 'text' ? res.content[0].text.trim() : null
        if (raw) {
          const parsed = parseSingleBlock(raw)
          if (parsed && (parsed as { type: string }).type === 'spreadsheet') {
            prependBlocks.push(parsed)
            anyHealed = true
          }
        }
      } catch { /* graceful fallback */ }
    }

    if (chartMissing) {
      try {
        const res = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          temperature: 0,
          messages: [{ role: 'user', content: `User asked for a chart. Emit a styled_chart AskBlock: {"type":"styled_chart","chart_type":"bar","color":"#7FB897","title":"...","data":[{"name":"...","value":0}]}. Source blocks: ${sourceContent}. Return ONLY a single JSON object.` }],
        })
        const raw = res.content[0].type === 'text' ? res.content[0].text.trim() : null
        if (raw) {
          const parsed = parseSingleBlock(raw)
          if (parsed && (parsed as { type: string }).type === 'styled_chart') {
            prependBlocks.push(parsed)
            anyHealed = true
          }
        }
      } catch { /* graceful fallback */ }
    }

    if (reasoningMissing) {
      try {
        const res = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          temperature: 0,
          messages: [{ role: 'user', content: `User asked for reasoning. Emit an ai_reasoning AskBlock: {"type":"ai_reasoning","question":"...","reasoning":"...","confidence":"medium"}. Source blocks: ${sourceContent.slice(0, 1000)}. Return ONLY a single JSON object.` }],
        })
        const raw = res.content[0].type === 'text' ? res.content[0].text.trim() : null
        if (raw) {
          const parsed = parseSingleBlock(raw)
          if (parsed && (parsed as { type: string }).type === 'ai_reasoning') {
            prependBlocks.push(parsed)
            anyHealed = true
          }
        }
      } catch { /* graceful fallback */ }
    }

    if (anyHealed) {
      await logHeal(businessId, 'wrong_block_type', true)
      return { blocks: [...prependBlocks, ...blocks], healed: true, healReason: 'wrong_block_type', healLatencyMs: Date.now() - t0 }
    }
  }

  // ── Check 3: Empty blocks on data question (main path only) ──────────────────
  // Fires when response had no <json_blocks> at all but user clearly asked a data question
  if (DATA_RE.test(userMessage) && blocks.length === 0 && pipelinePath === 'main') {
    const t0 = Date.now()
    try {
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        temperature: 0,
        messages: [{ role: 'user', content: `User asked a data question but the response had no visual blocks. Re-emit the response with AT LEAST one appropriate AskBlock (kpi_card, data_table, or aurora_summary). User question: ${userMessage.slice(0, 100)}. Original text: ${rawResponse.slice(0, 1500)}. Return ONLY <json_blocks>[...]</json_blocks>.` }],
      })
      const raw = res.content[0].type === 'text' ? res.content[0].text.trim() : null
      if (raw) {
        const healed = extractJsonBlocks(raw)
        if (healed && healed.length > 0) {
          await logHeal(businessId, 'empty_on_data_question', true)
          return { blocks: healed, healed: true, healReason: 'empty_on_data_question', healLatencyMs: Date.now() - t0 }
        }
      }
    } catch {
      await logHeal(businessId, 'empty_on_data_question', false)
    }
  }

  return { blocks, healed: false }
}
