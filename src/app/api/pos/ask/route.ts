export const maxDuration = 60
export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const tools: Anthropic.Tool[] = [
  {
    name: 'query_sales',
    description: 'Query sales data for a date range. Returns totals, breakdown by dimension, and optional period comparison.',
    input_schema: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'ISO date YYYY-MM-DD or relative: yesterday, this_week, last_week, last_friday, last_month, this_month' },
        to_date: { type: 'string', description: 'ISO date or "today"' },
        group_by: { type: 'string', enum: ['day', 'hour', 'product', 'category', 'cashier', 'outlet'] },
        category: { type: 'string', description: 'Optional category filter (beer, wine, spirits…)' },
        compare_to_previous: { type: 'boolean' },
      },
      required: ['from_date', 'to_date', 'group_by'],
    },
  },
  {
    name: 'query_inventory',
    description: 'Query stock levels. Supports low_stock, out_of_stock, dead_stock, or top_value filters.',
    input_schema: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['all', 'low_stock', 'dead_stock', 'out_of_stock', 'top_value'] },
        category: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['filter'],
    },
  },
  {
    name: 'query_customers',
    description: 'Query customer data — top spenders, at-risk, champions, new, or recent visitors.',
    input_schema: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['top_spenders', 'at_risk', 'champions', 'new', 'recent', 'all'] },
        period_days: { type: 'number' },
        limit: { type: 'number' },
      },
      required: ['filter'],
    },
  },
  {
    name: 'query_pricing',
    description: 'Find products with margin issues, underpriced, or overpriced items.',
    input_schema: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['low_margin', 'best_margin', 'all'] },
        category: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['filter'],
    },
  },
  {
    name: 'query_staff',
    description: 'Staff performance — revenue, transaction count, average basket by name.',
    input_schema: {
      type: 'object',
      properties: {
        from_date: { type: 'string' },
        to_date: { type: 'string' },
      },
      required: ['from_date', 'to_date'],
    },
  },
]

const SYSTEM = `You are Aria — the AI brain inside Aria POS.
You help retail business owners understand their data and make better decisions.
Style: warm, direct, succinct. Like a smart business analyst friend.
Use Australian English (colour, organisation). $ prefix for currency.

Always use tools to fetch real data before writing your answer. Never invent numbers.

When data has 3+ points and a chart would help, embed one using this exact format:
[chart:type=bar
  title=Sales by day
  data=[{"label":"Mon","value":1240},{"label":"Tue","value":890}]
  compare_data=[{"label":"Mon","value":1100},{"label":"Tue","value":950}]
]

After a chart, add 1-2 sentences on what to notice.

If the answer suggests an action, end with:
[action:label=Open reorder agent
  href=/pos/agents/reorder
  style=primary
]`

function parseRelativeDate(input: string): Date {
  const now = new Date()
  const s = input.toLowerCase().trim()
  if (s === 'today') return now
  if (s === 'yesterday') { const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(0,0,0,0); return d }
  if (s === 'last_friday') {
    const d = new Date(now); const day = d.getDay()
    const diff = day >= 5 ? day - 5 : day + 2; d.setDate(d.getDate() - diff); d.setHours(0,0,0,0); return d
  }
  if (s === 'this_week') { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d }
  if (s === 'last_week') { const d = new Date(now); d.setDate(d.getDate() - d.getDay() - 7); d.setHours(0,0,0,0); return d }
  if (s === 'this_month') return new Date(now.getFullYear(), now.getMonth(), 1)
  if (s === 'last_month') return new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const p = new Date(input); return isNaN(p.getTime()) ? now : p
}

async function executeTool(name: string, input: Record<string, unknown>, businessId: string) {
  const supabase = createServerSupabaseClient()

  if (name === 'query_sales') {
    const from = parseRelativeDate(input.from_date as string)
    const to = input.to_date === 'today' ? new Date() : parseRelativeDate(input.to_date as string)
    const groupBy = (input.group_by as string) ?? 'day'

    const { data: sales } = await supabase.from('pos_sales')
      .select('id, total_amount, created_at, served_by, outlet_id')
      .eq('business_id', businessId).neq('status', 'voided')
      .gte('created_at', from.toISOString()).lte('created_at', to.toISOString())
    const rows = sales ?? []

    if (groupBy === 'product' || groupBy === 'category') {
      const ids = rows.map(s => s.id)
      const { data: items } = ids.length > 0
        ? await supabase.from('pos_sale_items').select('product_id, quantity, unit_price, product_name, pos_products(name, category)').in('sale_id', ids)
        : { data: [] }

      const groups: Record<string, number> = {}
      ;(items ?? []).forEach((i: Record<string, unknown>) => {
        const prod = i.pos_products as { name?: string; category?: string } | null
        const key = groupBy === 'category' ? (prod?.category ?? 'Unknown') : (prod?.name ?? (i.product_name as string) ?? 'Unknown')
        groups[key] = (groups[key] ?? 0) + ((i.unit_price as number ?? 0) * (i.quantity as number ?? 0))
      })
      const breakdown = Object.entries(groups).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value).slice(0, 20)
      return { rows: breakdown.length, breakdown, total_revenue: Math.round(rows.reduce((s, r) => s + (r.total_amount ?? 0), 0) * 100) / 100, transactions: rows.length }
    }

    const groups: Record<string, number> = {}
    rows.forEach(s => {
      let key = ''
      if (groupBy === 'day') key = s.created_at.split('T')[0]
      else if (groupBy === 'hour') key = `${s.created_at.split('T')[0]} ${new Date(s.created_at).getHours()}:00`
      else if (groupBy === 'cashier') key = s.served_by ?? 'Unknown'
      else if (groupBy === 'outlet') key = s.outlet_id ?? 'Unknown'
      if (key) groups[key] = (groups[key] ?? 0) + (s.total_amount ?? 0)
    })
    const breakdown = Object.entries(groups).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => a.label.localeCompare(b.label)).slice(0, 50)
    const totalRevenue = Math.round(rows.reduce((s, r) => s + (r.total_amount ?? 0), 0) * 100) / 100

    let comparison = null
    if (input.compare_to_previous) {
      const ms = to.getTime() - from.getTime()
      const pf = new Date(from.getTime() - ms); const pt = new Date(from.getTime() - 1)
      const { data: prev } = await supabase.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', pf.toISOString()).lte('created_at', pt.toISOString())
      const prevRev = (prev ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
      comparison = { previous_revenue: Math.round(prevRev * 100) / 100, change_pct: prevRev > 0 ? Math.round(((totalRevenue - prevRev) / prevRev) * 1000) / 10 : 0 }
    }
    return { rows: breakdown.length, breakdown, total_revenue: totalRevenue, transactions: rows.length, comparison, period: { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] } }
  }

  if (name === 'query_inventory') {
    let q = supabase.from('pos_products').select('name, category, price, cost_price, stock_quantity').eq('business_id', businessId).eq('is_active', true)
    if (input.category) q = q.eq('category', input.category as string)
    const { data } = await q
    let items = data ?? []
    if (input.filter === 'low_stock') items = items.filter(p => (p.stock_quantity ?? 0) > 0 && (p.stock_quantity ?? 0) < 10)
    else if (input.filter === 'out_of_stock') items = items.filter(p => (p.stock_quantity ?? 0) === 0)
    else if (input.filter === 'dead_stock') items = items.filter(p => (p.stock_quantity ?? 0) > 20).sort((a, b) => (b.stock_quantity ?? 0) - (a.stock_quantity ?? 0))
    else if (input.filter === 'top_value') items = [...items].sort((a, b) => ((b.stock_quantity ?? 0) * (b.cost_price ?? 0)) - ((a.stock_quantity ?? 0) * (a.cost_price ?? 0)))
    return { rows: items.length, items: items.slice(0, (input.limit as number) ?? 30).map(p => ({ name: p.name, category: p.category, stock: p.stock_quantity ?? 0, price: p.price ?? 0 })) }
  }

  if (name === 'query_customers') {
    const days = (input.period_days as number) ?? 30
    const since = new Date(Date.now() - days * 86400000).toISOString()
    let q = supabase.from('pos_customers').select('name, email, total_spent, last_visit_at, rfm_segment, churn_risk').eq('business_id', businessId)
    if (input.filter === 'top_spenders') q = q.order('total_spent', { ascending: false })
    else if (input.filter === 'at_risk') q = q.gt('churn_risk', 0.7)
    else if (input.filter === 'champions') q = q.eq('rfm_segment', 'champions')
    else if (input.filter === 'new') q = q.gte('created_at', since)
    else if (input.filter === 'recent') q = q.gte('last_visit_at', since).order('last_visit_at', { ascending: false })
    const { data } = await q.limit((input.limit as number) ?? 20)
    return { rows: (data ?? []).length, customers: (data ?? []).map(c => ({ name: c.name, email: c.email, total_spent: Math.round((c.total_spent ?? 0) * 100) / 100, last_visit: c.last_visit_at, segment: c.rfm_segment })) }
  }

  if (name === 'query_pricing') {
    const { data } = await supabase.from('pos_products').select('name, category, price, cost_price').eq('business_id', businessId).eq('is_active', true)
    let items = (data ?? []).map(p => ({ ...p, margin_pct: p.cost_price && p.price ? Math.round(((p.price - p.cost_price) / p.price) * 1000) / 10 : 0 }))
    if (input.filter === 'low_margin') items = items.filter(p => p.margin_pct < 15).sort((a, b) => a.margin_pct - b.margin_pct)
    else if (input.filter === 'best_margin') items = items.sort((a, b) => b.margin_pct - a.margin_pct)
    if (input.category) items = items.filter(p => p.category === input.category)
    return { rows: items.length, items: items.slice(0, (input.limit as number) ?? 20) }
  }

  if (name === 'query_staff') {
    const from = parseRelativeDate(input.from_date as string)
    const to = input.to_date === 'today' ? new Date() : parseRelativeDate(input.to_date as string)
    const { data } = await supabase.from('pos_sales').select('total_amount, served_by').eq('business_id', businessId).neq('status', 'voided').gte('created_at', from.toISOString()).lte('created_at', to.toISOString())
    const map: Record<string, { revenue: number; count: number }> = {}
    ;(data ?? []).forEach(s => { const n = s.served_by ?? 'Unknown'; if (!map[n]) map[n] = { revenue: 0, count: 0 }; map[n].revenue += s.total_amount ?? 0; map[n].count++ })
    const staff = Object.entries(map).map(([name, v]) => ({ name, revenue: Math.round(v.revenue * 100) / 100, transactions: v.count, avg_basket: v.count > 0 ? Math.round(v.revenue / v.count * 100) / 100 : 0 })).sort((a, b) => b.revenue - a.revenue)
    return { rows: staff.length, staff }
  }

  return { error: 'unknown_tool' }
}

export async function POST(request: NextRequest) {
  const { messages: incomingMessages, conversation_id } = await request.json() as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    conversation_id?: string
  }
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: biz } = await supabase.from('businesses').select('id, name').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return new Response('No business', { status: 404 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
        const conversationMessages: MessageParam[] = [
          ...(incomingMessages ?? []).map(m => ({ role: m.role, content: m.content } as MessageParam)),
        ]

        let savedConvId: string | null = conversation_id ?? null
        let iterations = 0
        const MAX = 5

        while (iterations < MAX) {
          iterations++
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            system: SYSTEM,
            tools,
            messages: conversationMessages,
          })

          for (const block of response.content) {
            if (block.type === 'text') {
              for (let i = 0; i < block.text.length; i += 4) {
                send({ type: 'text', value: block.text.slice(i, i + 4) })
                await new Promise(r => setTimeout(r, 8))
              }
            }
            if (block.type === 'tool_use') {
              send({ type: 'tool_use', name: block.name, input: block.input })
            }
          }

          if (response.stop_reason === 'end_turn' || response.stop_reason !== 'tool_use') break

          const toolUses = response.content.filter(b => b.type === 'tool_use')
          conversationMessages.push({
            role: 'assistant',
            content: response.content as unknown as MessageParam['content'],
          })

          const toolResults = []
          for (const tu of toolUses) {
            if (tu.type !== 'tool_use') continue
            const result = await executeTool(tu.name, tu.input as Record<string, unknown>, biz.id)
            send({ type: 'tool_result', name: tu.name, result })

            // Truncate large results to avoid token overflow
            let sendResult: Record<string, unknown> = result as Record<string, unknown>
            if (Array.isArray(sendResult.rows) && sendResult.rows.length > 100) {
              sendResult = { ...sendResult, rows: (sendResult.rows as unknown[]).slice(0, 100), truncated: true, note: 'Results truncated to 100 rows for context efficiency.' }
            }
            if (Array.isArray(sendResult.breakdown) && (sendResult.breakdown as unknown[]).length > 100) {
              sendResult = { ...sendResult, breakdown: (sendResult.breakdown as unknown[]).slice(0, 100), truncated: true, note: 'Results truncated to 100 rows for context efficiency.' }
            }

            // Wrap empty results with explicit no-data instruction
            const rowCount = typeof sendResult.rows === 'number' ? sendResult.rows : (Array.isArray(sendResult.rows) ? sendResult.rows.length : 0)
            let content: string
            if (rowCount === 0 && !Array.isArray(sendResult.customers) && !Array.isArray(sendResult.staff) && !Array.isArray(sendResult.items)) {
              content = `No data available for this query. rows: 0. Do not estimate or assume — tell the user there is no data for this period. ${(sendResult as { message?: string }).message ?? 'No records found.'}`
            } else {
              content = JSON.stringify(sendResult)
            }
            toolResults.push({ type: 'tool_result' as const, tool_use_id: tu.id, content })
          }
          conversationMessages.push({
            role: 'user',
            content: toolResults as unknown as MessageParam['content'],
          })
        }

        const userText = (incomingMessages ?? []).filter(m => m.role === 'user').slice(-1)[0]?.content ?? ''
        const assistantText = conversationMessages.filter(m => m.role === 'assistant' && typeof m.content === 'string').slice(-1)[0]?.content as string ?? ''

        if (savedConvId) {
          await supabase.from('aria_conversations').update({
            messages: conversationMessages,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', savedConvId).eq('user_id', user.id)
        } else {
          const { data: nc } = await supabase.from('aria_conversations').insert({
            business_id: biz.id, user_id: user.id,
            title: userText.slice(0, 50),
            messages: conversationMessages,
            last_message_at: new Date().toISOString(),
          }).select('id').single()
          savedConvId = nc?.id ?? null
        }
        void assistantText

        send({ type: 'done', conversation_id: savedConvId })
        controller.close()
      } catch (err) {
        send({ type: 'error', value: err instanceof Error ? err.message : String(err) })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return Response.json({ conversations: [] })

  if (id) {
    const { data } = await supabase.from('aria_conversations').select('messages').eq('id', id).eq('user_id', user.id).single()
    return Response.json({ messages: data?.messages ?? [] })
  }

  const { data } = await supabase.from('aria_conversations')
    .select('id, title, last_message_at, created_at')
    .eq('user_id', user.id).eq('business_id', biz.id)
    .order('last_message_at', { ascending: false }).limit(50)
  return Response.json({ conversations: data ?? [] })
}
