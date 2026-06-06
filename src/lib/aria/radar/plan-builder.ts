import { supabaseAdmin } from '@/lib/supabase-admin'
import { runAriaModel } from '@/lib/aria/model-router'
import type { LossSignal } from './loss-detector'

export interface RadarPlan {
  signal_id: string
  signal_type: string
  title: string
  recommendation: string
  steps: string[]
  estimated_impact: string
  risk: 'low' | 'medium' | 'high'
  reversible: boolean
  propose_only: boolean
  preview_lines: string[]
  affected_count: number
  action_type: string
  payload: Record<string, unknown>
}

export async function buildPlan(businessId: string, signal: LossSignal): Promise<RadarPlan> {
  switch (signal.type) {
    case 'lapsing_customers':
      return buildWinbackPlan(businessId, signal)
    case 'unanswered_reviews':
      return buildReviewReplyPlan(businessId, signal)
    default:
      return buildProposePlan(businessId, signal)
  }
}

async function buildWinbackPlan(businessId: string, signal: LossSignal): Promise<RadarPlan> {
  const consentCount = Number(signal.payload.consent_count) || 0
  const customerCount = Number(signal.payload.customer_count) || 0
  const targetCount = consentCount > 0 ? consentCount : customerCount
  const avgSpend = Number(signal.payload.avg_spend_aud) || 0

  // Generate personalised winback message
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name, industry')
    .eq('id', businessId)
    .maybeSingle()

  const bizName = (biz as { name?: string } | null)?.name ?? 'us'

  const msgResult = await runAriaModel<{ message: string }>({
    task: 'sms_draft',
    systemPrompt: 'You are writing a warm, personalised winback SMS for an Australian small business. Max 160 characters. No emoji. No placeholders like [Name]. Write it as if speaking directly to a regular who has been away.',
    userPrompt: 'Business: ' + bizName + '\nCustomers: regulars who haven\'t visited in 45+ days, avg spend $' + avgSpend + '\nGoal: get them to come back\n\nOutput JSON: { "message": "..." }',
    maxTokens: 150,
  })

  const message = msgResult.data?.message ?? 'We miss you! Come back to ' + bizName + ' this week for 15% off your next visit. Just show this message.'

  return {
    signal_id: signal.id,
    signal_type: signal.type,
    title: 'Winback SMS campaign',
    recommendation: 'Create a draft winback campaign targeting ' + targetCount + ' opted-in lapsing customer' + (targetCount !== 1 ? 's' : '') + '.',
    steps: [
      'Generate personalised message for ' + targetCount + ' customer' + (targetCount !== 1 ? 's' : ''),
      'Create campaign draft in your CRM (status: draft — you send when ready)',
      'Monitor response rate and attribute returning visits',
    ],
    estimated_impact: '~$' + Math.round(signal.estimated_monthly_loss_aud * 0.25) + '/month recovered (25% return rate)',
    risk: 'low',
    reversible: false,
    propose_only: false,
    preview_lines: [
      'Will create a draft SMS campaign for ' + targetCount + ' opted-in customer' + (targetCount !== 1 ? 's' : ''),
      'Message: "' + message.slice(0, 80) + (message.length > 80 ? '…' : '') + '"',
      'Campaign saved as DRAFT — you review and send from the Campaigns page',
    ],
    affected_count: targetCount,
    action_type: 'winback_campaign',
    payload: {
      ...signal.payload,
      business_id: businessId,
      message,
    },
  }
}

async function buildReviewReplyPlan(businessId: string, signal: LossSignal): Promise<RadarPlan> {
  const reviewCount = Number(signal.payload.review_count) || 0

  return {
    signal_id: signal.id,
    signal_type: signal.type,
    title: 'AI-drafted review replies',
    recommendation: 'Generate professional, empathetic draft replies for ' + reviewCount + ' unanswered negative review' + (reviewCount !== 1 ? 's' : '') + '.',
    steps: [
      'Generate personalised draft reply for each of ' + reviewCount + ' review' + (reviewCount !== 1 ? 's' : ''),
      'Save drafts to google_reviews.ai_drafted_reply — NOT published yet',
      'You review and publish from the Reviews page',
    ],
    estimated_impact: 'Reduce deterrence impact on ~68% of prospective customers who read replies',
    risk: 'low',
    reversible: true,
    propose_only: false,
    preview_lines: [
      'Will create AI draft replies for ' + reviewCount + ' unanswered review' + (reviewCount !== 1 ? 's' : '') + ' (rated ≤3/5)',
      'Drafts saved for your review — nothing published automatically',
      'Replies will acknowledge concerns and invite customers back professionally',
    ],
    affected_count: reviewCount,
    action_type: 'draft_review_replies',
    payload: {
      ...signal.payload,
      business_id: businessId,
    },
  }
}

async function buildProposePlan(businessId: string, signal: LossSignal): Promise<RadarPlan> {
  const llmResult = await runAriaModel<{ steps: string[]; estimated_impact: string }>({
    task: 'explain',
    systemPrompt: 'You are a concise business advisor. Given a signal, output 3 concrete action steps and an estimated impact. Be specific, not generic. No fluff.',
    userPrompt: 'Signal: ' + signal.title + '\nInsight: ' + signal.insight + '\nSolution direction: ' + signal.solution + '\n\nOutput JSON: { "steps": ["...", "...", "..."], "estimated_impact": "..." }',
    schema: { steps: ['string'], estimated_impact: 'string' },
    maxTokens: 300,
  })

  const steps = Array.isArray(llmResult.data?.steps) && llmResult.data.steps.length >= 2
    ? llmResult.data.steps as string[]
    : [
      'Review the identified issue in your data',
      signal.solution.slice(0, 100),
      'Track impact over the following 2 weeks',
    ]

  return {
    signal_id: signal.id,
    signal_type: signal.type,
    title: signal.title,
    recommendation: signal.insight,
    steps,
    estimated_impact: llmResult.data?.estimated_impact ?? '$' + signal.estimated_monthly_loss_aud + '/month potential improvement',
    risk: 'low',
    reversible: false,
    propose_only: true,
    preview_lines: [
      signal.insight.slice(0, 100),
      'Plan saved to your action queue — no automatic changes made',
      signal.solution.slice(0, 80),
    ],
    affected_count: 0,
    action_type: signal.type,
    payload: {
      ...signal.payload,
      business_id: businessId,
    },
  }
}
