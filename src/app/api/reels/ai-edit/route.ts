export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { sanitizeEditSpec } from '@/lib/reels/sanitize-edit-spec'
import type { EditSpec } from '@/remotion/types'

const anthropic = new Anthropic()

// ── V2V intent detection — deterministic, no LLM cost ──────────────────────

const FILTER_BG_OVERRIDE = [
  /background\s+to\s+(dark|light|warm|cool|bright|dim)/i,
  /(dark|light|warm|cool|bright|dim)\s+background/i,
]

const V2V_BG_PATTERNS = [
  /remove\s+background/i,
  /cut\s+(me\s+)?out/i,
  /background\s+remov/i,
  /isolate\s+(me|subject|person)/i,
  /transparent\s+background/i,
  /change\s+(the\s+)?background/i,
  /swap\s+(the\s+)?background/i,
  /replace\s+(the\s+)?background/i,
  /different\s+background/i,
  /new\s+background/i,
  /green\s+screen/i,
]

const V2V_RESTYLE_PATTERNS = [
  /restyle/i,
  /anime(\s+style)?/i,
  /cartoon/i,
  /oil\s+painting/i,
  /watercolou?r/i,
  /sketch/i,
  /3d\s+(render|style)/i,
  /make\s+it\s+look\s+like/i,
  /film\s+look/i,
  /cinematic\s+grade/i,
  /change\s+the\s+style/i,
  /different\s+style/i,
  /artistic\s+style/i,
]

function detectV2VIntent(instruction: string): { isV2V: boolean; op: 'bg-remove' | 'restyle' | null } {
  if (FILTER_BG_OVERRIDE.some(p => p.test(instruction))) return { isV2V: false, op: null }
  if (V2V_BG_PATTERNS.some(p => p.test(instruction))) return { isV2V: true, op: 'bg-remove' }
  if (V2V_RESTYLE_PATTERNS.some(p => p.test(instruction))) return { isV2V: true, op: 'restyle' }
  return { isV2V: false, op: null }
}

// ── System prompt embeds the full EditSpec interface verbatim ───────────────

const EDIT_SPEC_SCHEMA = `interface EditSpec {
  videoUrl: string
  trimStartFrame: number
  trimEndFrame: number          // -1 = end of video
  speed: number                 // global speed (used when speedSegments is empty)
  filter: Filter
  filterIntensity: number       // 0-1 multiplier on the filter
  textLayers: TextLayer[]
  audioLayers: AudioLayer[]
  watermark: boolean
  outputFps: number
  outputWidth: number
  outputHeight: number
  speedSegments: SpeedSegment[] // if non-empty, overrides global \`speed\`
}

type Filter = 'none' | 'brightness' | 'contrast' | 'saturate' | 'grayscale' | 'sepia' | 'warm' | 'cool' | 'dramatic' | 'vivid' | 'noir' | 'golden'

type TextAnim = 'none' | 'fade' | 'slide-up' | 'pop'

interface TextLayer {
  id: string
  text: string
  startFrame: number
  endFrame: number
  fontSize: number
  color: string
  fontFamily: string
  x: number      // 0-100 percent
  y: number      // 0-100 percent
  bold: boolean
  shadow: boolean
  background: boolean
  backgroundColor: string
  anim?: TextAnim
}

interface SpeedSegment {
  startFrame: number
  endFrame: number
  speed: number        // playback rate, e.g. 0.5, 1, 2
  transition?: 'none' | 'fade' | 'whip'
}`

function buildSystemPrompt(durationFrames: number): string {
  return 'You are an Aria reel editor assistant. The user describes an edit in plain English.\n' +
    'Return ONLY a valid JSON EditSpec object. Rules:\n' +
    '- The EditSpec interface is:\n' + EDIT_SPEC_SCHEMA + '\n' +
    '- Valid filter values: none|brightness|contrast|saturate|grayscale|sepia|warm|cool|dramatic|vivid|noir|golden\n' +
    '- Valid TextAnim values: none|fade|slide-up|pop\n' +
    '- All frame numbers must be integers within 0..' + durationFrames + '. Start < end.\n' +
    '- Preserve videoUrl, outputWidth, outputHeight, outputFps, audioLayers exactly from current_spec.\n' +
    '- Do not invent fields that do not exist in the interface.\n' +
    '- Start from the current_spec and apply only what the instruction asks for.\n' +
    '- Return ONLY the JSON object. No markdown, no explanation, no backticks.'
}

// ── Route ───────────────────────────────────────────────────────────────────

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    business_id?: string
    instruction?: string
    current_spec?: EditSpec
    video_meta?: { durationFrames: number; fps: number }
  }

  const { business_id, instruction, current_spec, video_meta } = body

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  if (!instruction || typeof instruction !== 'string') return NextResponse.json({ error: 'instruction required' }, { status: 400 })
  if (!current_spec) return NextResponse.json({ error: 'current_spec required' }, { status: 400 })
  if (!video_meta) return NextResponse.json({ error: 'video_meta required' }, { status: 400 })

  // Ownership check
  const { data: biz } = await supabase.from('businesses').select('id, name')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // V2V intent check — deterministic, no LLM
  const v2vCheck = detectV2VIntent(instruction)
  if (v2vCheck.isV2V) {
    return NextResponse.json({
      v2v_required: true,
      op: v2vCheck.op,
      summary: v2vCheck.op === 'bg-remove'
        ? 'Background removal needs AI frame processing (~$0.21 AUD). Confirm to proceed.'
        : 'Restyling needs AI frame processing (~$0.95 AUD). Confirm to proceed.',
      spec: current_spec,
      changed: false,
    })
  }

  // Normal EditSpec patch via Claude
  const t0 = Date.now()
  const systemPrompt = buildSystemPrompt(video_meta.durationFrames)
  const userMessage = 'Instruction: "' + instruction + '"\n\nCurrent spec:\n' + JSON.stringify(current_spec)

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const latencyMs = Date.now() - t0
    const rawText = msg.content[0].type === 'text' ? msg.content[0].text : ''

    // Log to aria_ai_calls (non-fatal)
    try {
      const costUsdCents = Math.round(
        (msg.usage.input_tokens * 0.0000003 + msg.usage.output_tokens * 0.0000015) * 100,
      )
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id,
        agent_key: 'reel_ai_edit',
        provider: 'anthropic',
        model_id: 'claude-sonnet-4-5-20250929',
        role: 'generate_image',
        input_tokens: msg.usage.input_tokens,
        output_tokens: msg.usage.output_tokens,
        latency_ms: latencyMs,
        cost_usd_cents: costUsdCents,
        success: true,
        request_summary: 'Reel AI edit — instruction: ' + instruction.slice(0, 80),
        response_summary: 'EditSpec patch generated',
      })
    } catch { /* non-fatal */ }

    // Extract JSON
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({
        spec: current_spec,
        summary: "Couldn't parse that — try rephrasing",
        changed: false,
      })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({
        spec: current_spec,
        summary: "Couldn't parse that — try rephrasing",
        changed: false,
      })
    }

    const cleanSpec = sanitizeEditSpec(parsed, video_meta, current_spec)

    // Summarise what actually changed
    const changes: string[] = []
    if (cleanSpec.filter !== current_spec.filter) changes.push('filter → ' + cleanSpec.filter)
    if (cleanSpec.trimStartFrame !== current_spec.trimStartFrame || cleanSpec.trimEndFrame !== current_spec.trimEndFrame) changes.push('trim adjusted')
    if (cleanSpec.speed !== current_spec.speed) changes.push('speed → ' + cleanSpec.speed + 'x')
    if (cleanSpec.textLayers.length !== current_spec.textLayers.length) changes.push('text layers updated')
    else if (JSON.stringify(cleanSpec.textLayers) !== JSON.stringify(current_spec.textLayers)) changes.push('text updated')
    if (cleanSpec.speedSegments.length !== current_spec.speedSegments.length) changes.push('speed segments updated')

    const changed = changes.length > 0
    const summary = changed
      ? 'Done — ' + changes.join(', ') + '.'
      : 'No changes made — spec already matches that instruction.'

    return NextResponse.json({ spec: cleanSpec, summary, changed })

  } catch (e: unknown) {
    const latencyMs = Date.now() - t0
    const errMsg = e instanceof Error ? e.message : 'Edit failed'

    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id,
        agent_key: 'reel_ai_edit',
        provider: 'anthropic',
        model_id: 'claude-sonnet-4-5-20250929',
        role: 'generate_image',
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: latencyMs,
        cost_usd_cents: 0,
        success: false,
        error_message: errMsg,
        request_summary: 'Reel AI edit failed',
        response_summary: null,
      })
    } catch { /* non-fatal */ }

    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

export const POST = withErrorCapture('reels/ai-edit', _POST)
