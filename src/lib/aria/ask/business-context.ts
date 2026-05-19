import { supabaseAdmin } from '@/lib/supabase-admin'

export interface ConversationSummary {
  id: string
  title: string | null
  last_message_at: string
  message_count: number
  last_intent: string | null
}

export interface AskAriaContext {
  business_id: string
  business_name: string
  industry: string
  owner_name: string | null
  currency: string
  // Revenue snapshots
  revenue_today_cents: number
  revenue_week_cents: number
  revenue_month_cents: number
  avg_ticket_cents: number
  // Operational state
  low_stock_items: Array<{ id: string; name: string; qty: number; reorder_point: number | null }>
  staff_count: number
  open_support_tickets: number
  pending_aria_actions: number
  // Conversation memory
  conversation_history: Array<{ role: string; content: string }>
  recent_conversations: ConversationSummary[]
  // Fresh signals from monitoring engine
  fresh_signals: Array<{ signal_type: string; payload: Record<string, unknown>; created_at: string }>
  // Distilled memories from prior conversations
  memories: Array<{ id: string; kind: string; content: string; topic: string | null; importance: number }>
  // Per-category advice confidence weights from outcome learning
  advice_weights: Record<string, number>
}

export async function buildAskAriaContext(
  businessId: string,
  conversationId?: string,
): Promise<AskAriaContext> {
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0)
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1) // first of current month

  const [bizRes, salesTodayRes, salesWeekRes, salesMonthRes, lowStockRes, staffRes, ticketsRes, actionsRes, convHistRes, recentConvsRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('name,industry,owner_name').eq('id', businessId).maybeSingle(),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).gte('created_at', todayStart.toISOString()),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).gte('created_at', weekStart.toISOString()),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).gte('created_at', monthStart.toISOString()),
    supabaseAdmin.from('pos_outlet_inventory').select('id,product_id,quantity_on_hand,reorder_point,pos_products(name)').eq('business_id', businessId).lt('quantity_on_hand', 5).limit(10),
    supabaseAdmin.from('pos_users').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    supabaseAdmin.from('support_tickets').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'open'),
    supabaseAdmin.from('aria_actions').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'pending'),
    conversationId
      ? supabaseAdmin.from('aria_conversations').select('messages').eq('id', conversationId).eq('business_id', businessId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from('aria_conversations').select('id,title,last_message_at,message_count,last_intent').eq('business_id', businessId).order('last_message_at', { ascending: false }).limit(10),
  ])

  const biz = bizRes.data
  const sumCents = (rows: Array<{ total_amount: number | null }> | null) =>
    (rows ?? []).reduce((s, r) => s + Math.round((Number(r.total_amount) || 0) * 100), 0)

  const todayCents = sumCents(salesTodayRes.data)
  const weekCents = sumCents(salesWeekRes.data)
  const monthCents = sumCents(salesMonthRes.data)
  const salesCount = (salesMonthRes.data ?? []).length
  const avgTicket = salesCount > 0 ? Math.round(monthCents / salesCount) : 0
  console.log('[aria/context] month_revenue_cents', monthCents, 'rows', salesCount, 'business', businessId)

  const lowStock = (lowStockRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.product_id ?? r.id),
    name: String((r.pos_products as Record<string,unknown> | null)?.name ?? 'Unknown'),
    qty: Number(r.quantity_on_hand) || 0,
    reorder_point: r.reorder_point != null ? Number(r.reorder_point) : null,
  }))

  const convHistory: Array<{ role: string; content: string }> = (() => {
    const msgs = convHistRes.data?.messages
    if (!Array.isArray(msgs)) return []
    return (msgs as Array<{ role: string; content: string }>).slice(-20)
  })()

  const recentConvs: ConversationSummary[] = (recentConvsRes.data ?? []).map((r: Record<string,unknown>) => ({
    id: String(r.id),
    title: r.title ? String(r.title) : null,
    last_message_at: String(r.last_message_at),
    message_count: Number(r.message_count) || 0,
    last_intent: r.last_intent ? String(r.last_intent) : null,
  }))

  // Fetch fresh signals separately (non-blocking, best-effort)
  const { data: signalRows } = await supabaseAdmin
    .from('aria_signal_cache')
    .select('signal_type,payload,created_at')
    .eq('business_id', businessId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
    .then(r => r, () => ({ data: null }))

  // Fetch advice weights from outcome learning (non-blocking)
  const { data: weightRows } = await supabaseAdmin
    .from('aria_advice_weights')
    .select('category,weight')
    .eq('business_id', businessId)
    .then(r => r, () => ({ data: null }))

  const adviceWeights: Record<string, number> = {}
  for (const w of (weightRows ?? []) as Array<{ category: string; weight: number }>) {
    adviceWeights[w.category] = Number(w.weight)
  }

  // Fetch top memories by importance (non-blocking, best-effort)
  const { data: memoryRows } = await supabaseAdmin
    .from('aria_business_memory')
    .select('id,kind,content,topic,importance')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('importance', { ascending: false })
    .order('confidence', { ascending: false })
    .limit(15)
    .then(r => r, () => ({ data: null }))

  // Mark as referenced — fire-and-forget
  if (memoryRows && memoryRows.length > 0) {
    void (async () => {
      try {
        const ids = memoryRows.map((m: { id: string }) => m.id)
        await supabaseAdmin
          .from('aria_business_memory')
          .update({ last_referenced_at: new Date().toISOString() })
          .in('id', ids)
      } catch { /* non-fatal */ }
    })()
  }

  return {
    business_id: businessId,
    business_name: biz?.name ?? 'Your business',
    industry: biz?.industry ?? 'retail',
    owner_name: biz?.owner_name ?? null,
    currency: 'AUD',
    revenue_today_cents: todayCents,
    revenue_week_cents: weekCents,
    revenue_month_cents: monthCents,
    avg_ticket_cents: avgTicket,
    low_stock_items: lowStock,
    staff_count: Number(staffRes.count) || 0,
    open_support_tickets: Number(ticketsRes.count) || 0,
    pending_aria_actions: Number(actionsRes.count) || 0,
    conversation_history: convHistory,
    recent_conversations: recentConvs,
    fresh_signals: (signalRows ?? []) as Array<{ signal_type: string; payload: Record<string, unknown>; created_at: string }>,
    memories: (memoryRows ?? []) as Array<{ id: string; kind: string; content: string; topic: string | null; importance: number }>,
    advice_weights: adviceWeights,
  }
}
