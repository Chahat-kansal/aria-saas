export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { messageAgent } from '@/lib/aria/agents/message-agent'
import { automationAgent } from '@/lib/aria/agents/automation-agent'
import { writeAutomationMemory } from '@/lib/aria/agents/automation-agent'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { action_id: string; decision: 'approve' | 'dismiss' }
  const { action_id, decision } = body
  if (!action_id || !decision) return NextResponse.json({ error: 'action_id and decision required' }, { status: 400 })

  const { data: action } = await supabaseAdmin.from('aria_agent_actions')
    .select('*')
    .eq('id', action_id)
    .maybeSingle()

  if (!action) return NextResponse.json({ error: 'Action not found' }, { status: 404 })

  // Verify business ownership
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', action.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (decision === 'dismiss') {
    await supabaseAdmin.from('aria_agent_actions').update({
      approved: false, approved_at: new Date().toISOString(), approved_by: user.id,
    }).eq('id', action_id)

    // Write rejection to memory for learning
    if (action.agent_name === 'automation_agent' && action.action_output?.triggered) {
      for (const t of (action.action_output.triggered as Array<{ automation: string }>) ?? []) {
        await writeAutomationMemory(action.business_id, t.automation, 'rejected').catch(() => null)
      }
    }

    return NextResponse.json({ ok: true, executed: false })
  }

  // Approve: mark approved and execute
  await supabaseAdmin.from('aria_agent_actions').update({
    approved: true, approved_at: new Date().toISOString(), approved_by: user.id,
  }).eq('id', action_id)

  let executed = false
  try {
    if (action.agent_name === 'message_agent') {
      const intent = (action.action_input as Record<string, unknown>)?.intent as string ?? 'follow up'
      await messageAgent(intent, action.business_id)
      executed = true
    } else if (action.agent_name === 'automation_agent') {
      const recs = ((action.action_input as Record<string, unknown>)?.recommendations as string[]) ?? []
      await automationAgent(recs, action.business_id)
      executed = true
    }

    if (executed) {
      await supabaseAdmin.from('aria_agent_actions').update({
        executed: true, executed_at: new Date().toISOString(),
      }).eq('id', action_id)
    }
  } catch (e) {
    await supabaseAdmin.from('aria_agent_actions').update({
      error_detail: (e as Error).message,
    }).eq('id', action_id)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, executed })
}

export const POST = withErrorCapture('aria/approve-action', _POST)
