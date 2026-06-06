import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'

export type AutomationTrigger = {
  automation: 'winback' | 'reorder_alert' | 'review_request' | 'compliance_reminder'
  parameters: Record<string, unknown>
  risk_level: 'low' | 'medium' | 'high'
  reason: string
}

export type AutomationAgentResult = {
  triggered: AutomationTrigger[]
  action_id: string
  needs_approval: boolean
}

const RISK_MAP: Record<string, 'low' | 'medium' | 'high'> = {
  review_request: 'low',
  reorder_alert: 'medium',
  winback: 'high',
  compliance_reminder: 'medium',
}

const CLASSIFY_SYSTEM = `You are Aria's automation classifier.
Given a list of council recommendations, identify which of Aria's existing automations to trigger.
Available: winback, reorder_alert, review_request, compliance_reminder.
Only suggest an automation if a recommendation clearly maps to it.
Return ONLY valid JSON array:
[{ "automation": "winback|reorder_alert|review_request|compliance_reminder", "parameters": {}, "reason": "why" }]
If nothing applies, return [].`

async function checkMemoryRejections(businessId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin.from('aria_agent_memory')
    .select('memory_key, memory_value, confidence')
    .eq('business_id', businessId)
    .eq('memory_type', 'action_outcome')
    .gt('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
  const rejected = new Set<string>()
  for (const row of data ?? []) {
    const val = row.memory_value as Record<string, unknown>
    if (val?.outcome === 'rejected' && (Number(row.confidence) || 1) < 0.4) {
      rejected.add(row.memory_key as string)
    }
  }
  return rejected
}

async function writeMemory(businessId: string, automationType: string, outcome: 'executed' | 'rejected') {
  const key = 'automation_' + automationType
  try {
    const { data: existing } = await supabaseAdmin.from('aria_agent_memory')
      .select('id, times_confirmed, confidence')
      .eq('business_id', businessId)
      .eq('memory_type', 'action_outcome')
      .eq('memory_key', key)
      .maybeSingle()

    if (existing) {
      const tc = (existing.times_confirmed ?? 0) + (outcome === 'executed' ? 1 : 0)
      const conf = outcome === 'executed'
        ? Math.min(1, (Number(existing.confidence) || 0.5) + 0.1)
        : Math.max(0.1, (Number(existing.confidence) || 0.5) - 0.2)
      await supabaseAdmin.from('aria_agent_memory').update({
        times_confirmed: tc, confidence: conf,
        last_confirmed_at: new Date().toISOString(),
        memory_value: { triggered_at: new Date().toISOString(), outcome },
      }).eq('id', existing.id)
    } else {
      await supabaseAdmin.from('aria_agent_memory').insert({
        business_id: businessId, memory_type: 'action_outcome', memory_key: key,
        memory_value: { triggered_at: new Date().toISOString(), outcome },
        confidence: outcome === 'executed' ? 0.6 : 0.3,
        times_confirmed: outcome === 'executed' ? 1 : 0,
      })
    }
  } catch (e) { console.error('[non-fatal]', e) }
}

export async function automationAgent(
  recommendations: string[],
  businessId: string,
): Promise<AutomationAgentResult> {
  try {
    if (recommendations.length === 0) {
      const { data: row } = await supabaseAdmin.from('aria_agent_actions').insert({
        business_id: businessId, agent_name: 'automation_agent', action_type: 'trigger_automation',
        action_input: { recommendations }, action_output: { triggered: [] },
        risk_level: 'low', approved: true, executed: true, executed_at: new Date().toISOString(),
      }).select('id').single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { triggered: [], action_id: (row as any)?.id ?? '', needs_approval: false }
    }

    const recentlyRejected = await checkMemoryRejections(businessId)

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
    const classifyRes = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      temperature: 0,
      system: CLASSIFY_SYSTEM,
      messages: [{ role: 'user', content: recommendations.join('\n') }],
    })
    const classifyText = classifyRes.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('')

    let rawTriggers: Array<{ automation: string; parameters: Record<string, unknown>; reason: string }> = []
    try {
      const clean = classifyText.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
      const start = clean.indexOf('[')
      const end = clean.lastIndexOf(']')
      if (start >= 0 && end > start) rawTriggers = JSON.parse(clean.slice(start, end + 1))
    } catch { rawTriggers = [] }

    const valid = new Set(['winback', 'reorder_alert', 'review_request', 'compliance_reminder'])
    const filtered: AutomationTrigger[] = rawTriggers
      .filter(t => valid.has(t.automation) && !recentlyRejected.has('automation_' + t.automation))
      .map(t => ({
        automation: t.automation as AutomationTrigger['automation'],
        parameters: t.parameters ?? {},
        risk_level: RISK_MAP[t.automation] ?? 'medium',
        reason: t.reason ?? '',
      }))

    if (filtered.length === 0) {
      const { data: row } = await supabaseAdmin.from('aria_agent_actions').insert({
        business_id: businessId, agent_name: 'automation_agent', action_type: 'trigger_automation',
        action_input: { recommendations }, action_output: { triggered: [] },
        risk_level: 'low', approved: true, executed: true, executed_at: new Date().toISOString(),
      }).select('id').single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { triggered: [], action_id: (row as any)?.id ?? '', needs_approval: false }
    }

    const maxRisk: 'low' | 'medium' | 'high' = filtered.some(t => t.risk_level === 'high') ? 'high'
      : filtered.some(t => t.risk_level === 'medium') ? 'medium' : 'low'
    const needsApproval = maxRisk !== 'low'

    const { data: row } = await supabaseAdmin.from('aria_agent_actions').insert({
      business_id: businessId, agent_name: 'automation_agent', action_type: 'trigger_automation',
      action_input: { recommendations }, action_output: { triggered: filtered },
      risk_level: maxRisk, approved: !needsApproval ? true : null, executed: false,
    }).select('id').single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actionId = (row as any)?.id ?? ''

    if (!needsApproval) {
      for (const t of filtered) {
        await writeMemory(businessId, t.automation, 'executed')
      }
      await supabaseAdmin.from('aria_agent_actions').update({ executed: true, executed_at: new Date().toISOString() }).eq('id', actionId)
    }

    return { triggered: filtered, action_id: actionId, needs_approval: needsApproval }
  } catch (e) {
    console.error('[automation-agent] failed:', (e as Error).message)
    let errActionId = ''
    try {
      const { data: row } = await supabaseAdmin.from('aria_agent_actions').insert({
        business_id: businessId, agent_name: 'automation_agent', action_type: 'trigger_automation',
        action_input: { recommendations }, action_output: { error: (e as Error).message },
        risk_level: 'low', approved: false, executed: false, error_detail: (e as Error).message,
      }).select('id').single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      errActionId = (row as any)?.id ?? ''
    } catch (e) { console.error('[non-fatal]', e) }
    return { triggered: [], action_id: errActionId, needs_approval: false }
  }
}

export { writeMemory as writeAutomationMemory }
