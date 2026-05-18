export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { callAnthropic } from '@/lib/aria/providers/anthropic'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const body = await req.json().catch(() => ({}))
  const devices: Array<{ device_type: string; connection_type: string; last_error: string | null; network_address?: string | null }> = body.devices ?? []
  if (!devices.length) return NextResponse.json({ diagnosis: 'No errored devices to diagnose.' })

  const deviceSummary = devices.map(d =>
    `- ${d.device_type} (${d.connection_type})${d.network_address ? ` @ ${d.network_address}` : ''}: ${d.last_error ?? 'no error'}`
  ).join('\n')

  const result = await callAnthropic<{ diagnosis: string }>(
    {
      model: 'haiku',
      systemPrompt: 'You are a POS hardware support expert. Diagnose device errors and provide concise, actionable fixes (2-3 sentences per device). Return JSON: { "diagnosis": "..." }',
      userPrompt: `Devices with errors:\n${deviceSummary}`,
      maxTokens: 512,
      businessId: bid ?? undefined,
      agentKey: 'hardware',
      role: 'agent',
    },
    { diagnosis: 'Could not diagnose devices.' }
  )

  return NextResponse.json({ diagnosis: result.data.diagnosis })
}

export const POST = withErrorCapture('aria/hardware-troubleshoot', _POST)
