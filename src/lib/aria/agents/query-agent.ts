import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'

export type QueryAgentResult = {
  question: string
  query_executed: string
  result: unknown[]
  summary: string
  confidence: 'high' | 'medium' | 'low'
  failed?: boolean
}

const ALLOWED_TABLES = new Set([
  'pos_sales', 'pos_sale_items', 'pos_products', 'customers',
  'pos_shift_reports', 'staff_members', 'business_hours', 'pos_categories',
])

const QUERY_SYSTEM = `You are a DB query translator for an Australian small business.
Given a business question, produce a SAFE READ-ONLY Supabase query.
The business_id is always scoped. NEVER produce DELETE, UPDATE, INSERT, DROP, or TRUNCATE.
Output ONLY valid JSON:
{ "table": "string", "select": "string", "filters": {}, "order": "string", "limit": number }`

const SUMMARY_SYSTEM = `You are a plain-English summariser. Given a DB query result as JSON, write ONE concise sentence (max 20 words) summarising the key finding. No preamble.`

async function logAction(businessId: string, question: string, queryDesc: string, resultCount: number) {
  try {
    await supabaseAdmin.from('aria_agent_actions').insert({
      business_id: businessId,
      agent_name: 'query_agent',
      action_type: 'db_query',
      action_input: { question },
      action_output: { query: queryDesc, result_count: resultCount },
      risk_level: 'low',
      approved: true,
      executed: true,
      executed_at: new Date().toISOString(),
    })
  } catch (e) { console.error('[query-agent] logAction failed:', e) }
}

export async function queryAgent(question: string, businessId: string): Promise<QueryAgentResult> {
  const failed = (reason: string): QueryAgentResult => ({
    question, query_executed: '', result: [], summary: reason, confidence: 'low', failed: true,
  })

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })

    const planRes = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 300,
      temperature: 0,
      system: QUERY_SYSTEM,
      messages: [{ role: 'user', content: question }],
    })
    const planText = planRes.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('')

    let plan: { table: string; select: string; filters: Record<string, unknown>; order: string; limit: number }
    try {
      const clean = planText.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
      const start = clean.indexOf('{')
      const end = clean.lastIndexOf('}')
      plan = JSON.parse(clean.slice(start, end + 1))
    } catch {
      return failed('Could not parse query plan')
    }

    if (!ALLOWED_TABLES.has(plan.table)) {
      return failed(`Table "${plan.table}" is not in the allowed read-only list`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabaseAdmin
      .from(plan.table)
      .select(plan.select || '*')
      .eq('business_id', businessId)

    for (const [col, val] of Object.entries(plan.filters ?? {})) {
      q = q.eq(col, val)
    }
    if (plan.order) {
      q = q.order(plan.order, { ascending: false })
    }
    q = q.limit(Math.min(plan.limit || 20, 100))

    const { data, error } = await q
    if (error) return failed('Query error: ' + error.message)
    const rows: unknown[] = data ?? []

    await logAction(businessId, question, JSON.stringify(plan), rows.length)

    let summary = rows.length + ' rows returned'
    try {
      const sumRes = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        temperature: 0,
        system: SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(rows.slice(0, 5)) }],
      })
      summary = sumRes.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim()
    } catch (e) { console.warn('[query-agent] summary generation failed, using row count:', e) }

    return {
      question,
      query_executed: JSON.stringify(plan),
      result: rows,
      summary,
      confidence: rows.length > 0 ? 'high' : 'medium',
      failed: false,
    }
  } catch (e) {
    console.error('[query-agent] failed:', (e as Error).message)
    return failed((e as Error).message)
  }
}
