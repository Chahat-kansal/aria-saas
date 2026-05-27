import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { CouncilOutput } from '../council'
import { queryAgent } from './query-agent'
import { messageAgent } from './message-agent'
import { automationAgent } from './automation-agent'

export type OrchestratorResult = {
  actions_taken: string[]
  actions_suggested: Array<{ agent: string; intent: string; urgency: 'now' | 'suggest' }>
  agent_action_ids: string[]
}

const ORCHESTRATOR_SYSTEM = `You are Aria's orchestration layer. Read the council's output. For each actionable recommendation, decide: (a) which agent should act on it, (b) what input to give that agent, (c) whether this is urgent (act now) or advisory (suggest to owner).
Agents: query_agent (read-only DB queries), message_agent (customer messages), automation_agent (triggers automations like winback/reorder).
Return JSON only: { "actions": [{ "agent": "query_agent|message_agent|automation_agent", "intent": "...", "urgency": "now|suggest" }] }
Limit to 3 actions per briefing. Only suggest 'now' for clearly low-risk, obvious actions. When in doubt, use 'suggest'.`

type PlanAction = { agent: string; intent: string; urgency: 'now' | 'suggest' }

export async function runOrchestrator(
  council: CouncilOutput,
  businessId: string,
  mode: 'briefing' | 'weekly_report',
): Promise<OrchestratorResult> {
  const result: OrchestratorResult = { actions_taken: [], actions_suggested: [], agent_action_ids: [] }

  try {
    const { data: memories } = await supabaseAdmin.from('aria_agent_memory')
      .select('memory_key, confidence')
      .eq('business_id', businessId)
      .eq('memory_type', 'action_outcome')
    const memoryContext = (memories ?? []).map(m => `${m.memory_key}: confidence=${m.confidence}`).join(', ')

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
    const consensus = (council.consensus ?? []).join('; ')
    const recs = (council.raw_brain_outputs ?? []).flatMap(b => b.recommendations).slice(0, 10).join('; ')
    const planRes = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 400,
      temperature: 0,
      system: ORCHESTRATOR_SYSTEM,
      messages: [{
        role: 'user',
        content: 'Mode: ' + mode + '\n\nConsensus: ' + consensus + '\n\nRecommendations: ' + recs + (memoryContext ? '\n\nOwner preference history: ' + memoryContext : ''),
      }],
    })
    const planText = planRes.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('')

    let plan: { actions: PlanAction[] }
    try {
      const clean = planText.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
      const start = clean.indexOf('{')
      const end = clean.lastIndexOf('}')
      plan = JSON.parse(clean.slice(start, end + 1))
    } catch {
      return result
    }

    for (const action of (plan.actions ?? []).slice(0, 3)) {
      try {
        if (action.agent === 'query_agent') {
          if (action.urgency === 'now') {
            const r = await queryAgent(action.intent, businessId)
            if (!r.failed) result.actions_taken.push('query: ' + r.summary)
          } else {
            result.actions_suggested.push(action)
          }
        } else if (action.agent === 'message_agent') {
          if (action.urgency === 'now') {
            const r = await messageAgent(action.intent, businessId)
            result.agent_action_ids.push(r.action_id)
            if (r.needs_approval) {
              result.actions_suggested.push({ ...action, urgency: 'suggest' })
            } else {
              result.actions_taken.push('messages: drafted and sent ' + r.drafts.length)
            }
          } else {
            result.actions_suggested.push(action)
          }
        } else if (action.agent === 'automation_agent') {
          if (action.urgency === 'now') {
            const r = await automationAgent(council.consensus ?? [], businessId)
            result.agent_action_ids.push(r.action_id)
            if (r.needs_approval) {
              result.actions_suggested.push({ ...action, urgency: 'suggest' })
            } else {
              result.actions_taken.push('automation: triggered ' + r.triggered.map(t => t.automation).join(', '))
            }
          } else {
            result.actions_suggested.push(action)
          }
        }
      } catch (e) {
        console.error('[orchestrator] agent call failed:', action.agent, (e as Error).message)
      }
    }
  } catch (e) {
    console.error('[orchestrator] planning failed:', (e as Error).message)
  }

  return result
}
