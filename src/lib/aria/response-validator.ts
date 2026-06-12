import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { callAnthropicWithTools } from '@/lib/aria/providers/anthropic'
import { ARIA_POS_TOOLS, executePOSTool } from '@/lib/aria-tools'
import type { AskBlock } from '@/lib/aria/ask-types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })

const SPREADSHEET_RE = /spreadsheet|\bcsv\b|excel|export/i
const CHART_RE = /\bchart\b|visuali[sz]e|graph|plot/i
const REASONING_RE = /\bwhy\b|reasoning|because|explain why/i
const DATA_RE = /how much|how many|revenue|sales|customers|orders|top|best|worst|average|total|count/i

// GROUND-1 Check 4 signals
const NUMERIC_RE = /\$|\bdollar|revenue|sales|orders|customers|how much|how many|today|yesterday|this week|last week|this month|last month|compared to|\bvs\b|\b\d+%/i
const CURRENCY_OUT = /\$\s?[0-9]/
const PERCENT_OUT = /[0-9]+(\.[0-9]+)?\s?%/

type HealReason = 'malformed_json' | 'wrong_block_type' | 'empty_on_data_question' | 'ungrounded_numeric'

async function logHeal(businessId: string, healReason: HealReason, success: boolean, signal?: string): Promise<void> {
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
      learning_signal: signal ?? ('healed:' + healReason),
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
  pipelinePath: 'main' | 'deliverable' | 'council'
  businessId: string
  toolsUsed: number
}): Promise<{
  blocks: AskBlock[]
  healed: boolean
  healReason?: HealReason
  healLatencyMs?: number
  healedText?: string
}> {
  const { userMessage, blocks: inputBlocks, rawResponse, pipelinePath, businessId, toolsUsed } = args
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

  // ── Check 3: Empty blocks on data question (main + council paths) ────────────
  // Fires when response had no blocks at all but user clearly asked a data question
  if (DATA_RE.test(userMessage) && blocks.length === 0 && pipelinePath !== 'deliverable') {
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

  // ── Check 4 (GROUND-1): Ungrounded numeric response ───────────────────────────
  // Fires when the user asked a numeric question, the response states currency/percentages,
  // but ZERO data tools were called this turn — re-prompts once with mandatory tool use.
  if (
    toolsUsed === 0 &&
    NUMERIC_RE.test(userMessage) &&
    (CURRENCY_OUT.test(rawResponse) || PERCENT_OUT.test(rawResponse))
  ) {
    const t0 = Date.now()
    try {
      const healPrompt = `The previous response contained numeric facts (dollar amounts or percentages) but no data tool was called. Per the GROUNDING RULE, every number must come from a tool call. Answer the user's question again — you MUST call query_business_data first to fetch the real numbers, then state them verbatim from the tool result. Do not include any number you cannot ground.

User question: ${userMessage.slice(0, 100)}
Previous (ungrounded) response: ${rawResponse.slice(0, 800)}

Respond now. Call the tool first, then answer. If the question warrants a visual, wrap blocks in <json_blocks>[...]</json_blocks>.`

      const groundingTools = ARIA_POS_TOOLS.filter((t: { name: string }) => ['query_business_data', 'compare_periods'].includes(t.name))
      const healResult = await callAnthropicWithTools({
        model: 'haiku',
        systemPrompt: 'You are Aria, an AI business assistant for Australian small businesses. Every number you state MUST come from a tool result in this conversation. Be brief — answer the question with grounded numbers, nothing more.',
        userPrompt: healPrompt,
        tools: groundingTools,
        executeTool: (name, input) => executePOSTool(name, input, businessId),
        maxTokens: 1500,
        maxIterations: 3,
        timeoutMs: 25_000,
        agentKey: 'heal',
        role: 'other',
      })
      if (healResult.success && healResult.tool_calls.length > 0 && healResult.raw.trim()) {
        const healedBlocks = extractJsonBlocks(healResult.raw)
        const healedText = healResult.raw.replace(/<json_blocks>[\s\S]*?<\/json_blocks>/gi, '').trim()
        await logHeal(businessId, 'ungrounded_numeric', true, 'guard_fired:ungrounded_numeric')
        return {
          blocks: healedBlocks && healedBlocks.length > 0 ? healedBlocks : blocks,
          healed: true,
          healReason: 'ungrounded_numeric',
          healLatencyMs: Date.now() - t0,
          healedText: healedText || undefined,
        }
      }
      await logHeal(businessId, 'ungrounded_numeric', false, 'guard_fired:ungrounded_numeric')
    } catch {
      await logHeal(businessId, 'ungrounded_numeric', false, 'guard_fired:ungrounded_numeric')
    }
  }

  return { blocks, healed: false }
}
