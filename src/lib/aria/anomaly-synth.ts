import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Signal } from './signal-engine'

export async function synthesizeFromSignals(businessId: string, signals: Signal[]): Promise<void> {
  const alerts = signals.filter(s => s.severity === 'alert' || s.severity === 'critical')
  if (!alerts.length) return

  const { data: biz } = await supabaseAdmin.from('businesses').select('name,industry,city').eq('id', businessId).single()
  if (!biz) return

  const facts = alerts.map(a => `- ${a.signal_type} (${a.severity}): ${JSON.stringify(a.payload)}`).join('\n')

  const prompt =
    `Business: ${biz.name} (${biz.industry ?? 'retail'}, ${biz.city ?? 'Australia'}).\n` +
    `Fresh anomalies from monitoring engine:\n${facts}\n\n` +
    `For each anomaly produce ONE recommendation. Return JSON ONLY in this exact shape, no preamble:\n` +
    `{\n  "recommendations": [\n    { "title": "Short imperative title", "category": "inventory|sales|customers|staff|cashflow|compliance|pricing", "priority": "high|medium|low", "recommendation": "One paragraph for the owner. Australian English. Specific.", "reason": "Why this matters, with the number.", "expected_impact": "Quantified if possible.", "confidence": 0.0 }\n  ]\n}\n` +
    `Output JSON only. No preamble. No code blocks.`

  const { callGemini } = await import('./providers/gemini')
  const geminiResult = await callGemini({
    systemPrompt: 'You are a business analyst for Australian small businesses. Return JSON only. No preamble.',
    userPrompt: prompt,
    maxTokens: 2048,
    businessId,
    agentKey: 'signal_engine_synth',
    role: 'analysis',
  })

  if (!geminiResult.success || !geminiResult.raw) {
    console.error('[anomaly-synth] Gemini call failed, skipping synthesis for', businessId)
    return
  }

  const text = geminiResult.raw

  let parsed: { recommendations?: Array<{ title: string; category: string; priority: string; recommendation: string; reason: string; expected_impact: string; confidence: number }> } = {}
  try { parsed = JSON.parse(text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()) } catch (e) { console.error('[anomaly-synth] JSON parse error:', e); return }
  if (!parsed.recommendations?.length) return

  const rows = parsed.recommendations.map(r => ({
    business_id: businessId,
    title: r.title,
    category: r.category,
    priority: r.priority,
    recommendation: r.recommendation,
    reason: r.reason,
    expected_impact: r.expected_impact,
    confidence: r.confidence,
    status: 'pending',
    source: 'signal_engine',
    triggered_by: 'system',
    payload: { triggering_signals: alerts.map(a => a.signal_type) },
  }))

  await supabaseAdmin.from('aria_actions').insert(rows)
}
