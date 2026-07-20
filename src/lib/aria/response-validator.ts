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

type HealReason = 'malformed_json' | 'wrong_block_type' | 'empty_on_data_question' | 'ungrounded_numeric' | 'fabrication_stripped'

// GROUNDING-TEETH Check 5 / SUMMARIZER-FIX-1 shared scanner: risky numeric tokens + corpus parsing.
// V3 widens the format coverage so a fabricated number can't slip through in a shape V1/V2 missed:
//   1. $-currency ($1,234.50)                            [V1]
//   2. word-form dollars (480 dollars) — V3
//   3. percentages (4.8%)                                [V1]
//   4. multiplier comparisons (3x higher/lower/more/less) [V1]
//   5. bare COUNT + data-noun (23 customers / 45 orders) — V3. Restricted to >=10 (\d{2,}) and a
//      genuine data noun so presentational list-sizes ("top 3 products") are NOT swept in.
// Every matched token is still validated against the CLEAN ground-truth anchors / source corpus —
// grounded counts (e.g. "19 customers" when 19 is an anchor) pass; fabricated ones are stripped.
export const RISKY_NUMERIC_RE = /(\$\s?[\d,]+(?:\.\d+)?)|(\b\d[\d,]*(?:\.\d+)?\s?dollars?\b)|(\b\d{1,3}(?:\.\d+)?\s?%)|(\b\d+(?:\.\d+)?\s?[x×]\s?(?:higher|lower|more|less))|(\b\d{2,}(?:,\d{3})*\s?(?:customers?|sales|orders?|transactions?|bookings?|reviews?|visits?|sign[\s-]?ups?))/gi

export function extractNumbers(corpus: string): number[] {
  const matches = corpus.match(/\d[\d,]*(?:\.\d+)?/g) ?? []
  const out: number[] = []
  for (const m of matches) {
    const v = parseFloat(m.replace(/,/g, ''))
    if (isFinite(v)) out.push(v)
  }
  return out
}

// GROUNDING-TEETH-V2: owner-citation phrases are direct grounding (model reading aria_business_memory
// decisions/goals correctly) — never strip a sentence that cites the owner, even with numbers.
const OWNER_CITATION_RE = /you (mentioned|stated|said|told me|asked|committed|wanted|set)/i

// BRIEF-FIX-1 (BUG 1) — shown when every sentence in the text turned out to be ungrounded (e.g. a
// dormant business with zero real anchors): the honest answer, never a substitute number.
const NO_GROUNDED_DATA_FALLBACK = "Aria doesn't have enough verified data yet to state specific figures here."

/**
 * GROUNDING-TEETH-V2 Check 6 core (shared by the synthesis validator AND the per-advisor cleaner).
 * Strips any sentence whose $/% number does NOT match a CLEAN ground-truth anchor within 2% — UNLIKE
 * V1's Check 5, the anchor set here is ONLY the verified live-queried values, never the advisor
 * outputs (which is how V1 let an advisor-invented "$480" self-ground). Surgical, never empties.
 *
 * BRIEF-FIX-1 (BUG 1) — zero anchors used to bypass this whole function (`anchorNumbers.length === 0`
 * returned the text unchanged), which silently disabled the guard for exactly the businesses most
 * likely to get a hallucinated number: dormant/thin-data ones with nothing real to ground against.
 * Zero anchors now means every risky number is ungrounded by definition — same loop, no bypass. And
 * the old "never strip if it leaves nothing" safety valve reverted to the ORIGINAL fabricated text
 * when everything was risky — backwards, since that's the case with the most fabrication. It now
 * falls back to an honest "don't have that data" sentence instead.
 */
export function stripUngroundedNumbers(text: string, anchorNumbers: number[]): { healedText: string; stripped: string[] } {
  if (!text || !text.trim()) return { healedText: text, stripped: [] }
  const sentences = text.split(/(?<=[.!?])\s+/)
  const kept: string[] = []
  const stripped: string[] = []
  for (const sentence of sentences) {
    if (OWNER_CITATION_RE.test(sentence)) { kept.push(sentence); continue } // Part 4 bypass
    const matches = sentence.match(RISKY_NUMERIC_RE) ?? []
    let fabricated = false
    for (const m of matches) {
      const v = parseFloat(m.replace(/[^0-9.]/g, ''))
      if (!isFinite(v)) continue
      const grounded = anchorNumbers.some(n => n === v || (n > 0 && Math.abs(n - v) / n <= 0.02))
      if (!grounded) { fabricated = true; break }
    }
    if (fabricated) stripped.push(sentence)
    else kept.push(sentence)
  }
  if (stripped.length === 0) return { healedText: text, stripped: [] }
  const healedText = kept.length > 0 ? kept.join(' ').trim() : NO_GROUNDED_DATA_FALLBACK
  return { healedText, stripped }
}

async function logHeal(businessId: string, healReason: HealReason, success: boolean, signal?: string): Promise<void> {
  try {
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: businessId,
      agent_key: 'heal',
      provider: 'anthropic',
      model_id: 'claude-haiku-4-5-20251001',
      role: 'other',
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
  groundTruth?: string
  // GROUNDING-TEETH-V2: CLEAN anchor values only (the verified available_ground_truth numbers, NOT
  // the advisor-output corpus). Check 6 validates $/% against these so advisor-invented numbers cannot
  // self-ground the way they did under V1's Check 5.
  groundTruthAnchors?: string
}): Promise<{
  blocks: AskBlock[]
  healed: boolean
  healReason?: HealReason
  healLatencyMs?: number
  healedText?: string
}> {
  const { userMessage, blocks: inputBlocks, rawResponse, pipelinePath, businessId, toolsUsed, groundTruth, groundTruthAnchors } = args
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

  // ── Check 5 (GROUNDING-TEETH): Fabrication scan — council path only ──────────
  // Pure-code check (no LLM call): every risky numeric token in the synthesis text must
  // appear in the council's grounded inputs (context + advisor outputs), verbatim or within
  // 2% tolerance. Ungrounded sentences are stripped surgically — never blocks the response.
  if (pipelinePath === 'council' && groundTruth && rawResponse.trim()) {
    try {
      const corpusNumbers = extractNumbers(groundTruth)
      const RISKY = RISKY_NUMERIC_RE
      const sentences = rawResponse.split(/(?<=[.!?])\s+/)
      const kept: string[] = []
      let strippedCount = 0
      for (const sentence of sentences) {
        const matches = sentence.match(RISKY) ?? []
        let fabricated = false
        for (const m of matches) {
          const v = parseFloat(m.replace(/[^0-9.]/g, ''))
          if (!isFinite(v)) continue
          const grounded = corpusNumbers.some(n => n === v || (n > 0 && Math.abs(n - v) / n <= 0.02))
          if (!grounded) { fabricated = true; break }
        }
        if (fabricated) strippedCount++
        else kept.push(sentence)
      }
      if (strippedCount > 0 && kept.length > 0) {
        const healedText = kept.join(' ').trim() +
          " I couldn't verify some specific figures from your data — focus on what's confirmed above."
        await logHeal(businessId, 'fabrication_stripped', true, 'guard_fired:fabrication_stripped')
        return { blocks, healed: true, healReason: 'fabrication_stripped', healedText }
      }
    } catch { /* graceful — never block the response */ }
  }

  // ── Check 6 (GROUNDING-TEETH-V2): strict ground-truth — council path only ────
  // Validates synthesis $/% against the CLEAN anchors ONLY (not advisor outputs). Catches numbers
  // an advisor invented and the synthesis faithfully repeated — the exact V1 escape hatch. Runs
  // AFTER Check 5 (Check 5 unchanged). Skips when no anchors (nothing to validate against → trust V1).
  if (pipelinePath === 'council' && groundTruthAnchors && rawResponse.trim()) {
    try {
      const anchorNumbers = extractNumbers(groundTruthAnchors)
      const { healedText, stripped } = stripUngroundedNumbers(rawResponse, anchorNumbers)
      if (stripped.length > 0) {
        const finalText = healedText + ' (Some figures couldn\'t be verified — focus on confirmed numbers above.)'
        await logHeal(businessId, 'fabrication_stripped', true, 'guard_fired:strict_groundtruth_stripped')
        return { blocks, healed: true, healReason: 'fabrication_stripped', healedText: finalText }
      }
    } catch { /* graceful — never block the response */ }
  }

  return { blocks, healed: false }
}
