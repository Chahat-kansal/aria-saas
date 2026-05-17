export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { parseLLMJsonOr } from '@/lib/ai-json'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const devices: Array<{ device_type: string; connection_type: string; last_error: string | null; network_address?: string | null }> = body.devices ?? []
  if (!devices.length) return NextResponse.json({ diagnosis: 'No errored devices to diagnose.' })

  const deviceSummary = devices.map(d =>
    `- ${d.device_type} (${d.connection_type})${d.network_address ? ` @ ${d.network_address}` : ''}: ${d.last_error ?? 'no error'}`
  ).join('\n')

  const prompt = `You are a POS hardware support expert. Diagnose the following device errors and provide concise, actionable fixes (2-3 sentences per device). Return JSON: { "diagnosis": "..." }

Devices with errors:
${deviceSummary}`

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
  const parsed = parseLLMJsonOr<{ diagnosis: string }>(raw, { diagnosis: raw })
  return NextResponse.json({ diagnosis: parsed.diagnosis })
}

export const POST = withErrorCapture('aria/hardware-troubleshoot', _POST)
