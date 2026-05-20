// Per-business cost guards — prevent runaway AI spend
// These are checked BEFORE expensive operations run

import { supabaseAdmin } from '@/lib/supabase-admin'

// Plan-based daily limits (in USD cents)
const DAILY_LIMITS: Record<string, { total: number; images: number; web_search: number; chats: number }> = {
  starter:    { total: 200,  images: 10,  web_search: 30,  chats: 100 },   // $2.00/day = ~$60/mo cap
  growth:     { total: 500,  images: 30,  web_search: 100, chats: 300 },   // $5.00/day = ~$150/mo cap
  scale:      { total: 1500, images: 100, web_search: 300, chats: 1000 },  // $15/day
  enterprise: { total: 5000, images: 500, web_search: 1000, chats: 5000 }, // $50/day
}

export type CostKind = 'chat' | 'image' | 'web_search' | 'sms'

export interface SpendCheck {
  allowed: boolean
  reason?: string
  current_spend_cents?: number
  daily_limit_cents?: number
}

export async function checkSpendAllowed(
  businessId: string,
  kind: CostKind,
  estimatedCostCents: number,
): Promise<SpendCheck> {
  // Get business plan
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, subscription_tier')
    .eq('id', businessId)
    .maybeSingle()

  const tier = (biz?.subscription_tier as string)?.toLowerCase() ?? 'starter'
  const limits = DAILY_LIMITS[tier] ?? DAILY_LIMITS.starter

  // Get today's spend
  const today = new Date().toISOString().slice(0, 10)
  const { data: spend } = await supabaseAdmin
    .from('aria_daily_spend')
    .select('total_cost_cents, image_count, web_search_count, chat_count')
    .eq('business_id', businessId)
    .eq('day', today)
    .maybeSingle()

  const currentTotal = spend?.total_cost_cents ?? 0
  const currentImages = spend?.image_count ?? 0
  const currentWebSearch = spend?.web_search_count ?? 0
  const currentChats = spend?.chat_count ?? 0

  // Check total cost
  if (currentTotal + estimatedCostCents > limits.total) {
    return {
      allowed: false,
      reason: `Daily AI spend limit reached ($${(limits.total / 100).toFixed(2)}/day on ${tier} plan). Resets at midnight AEST.`,
      current_spend_cents: currentTotal,
      daily_limit_cents: limits.total,
    }
  }

  // Per-tool limits
  if (kind === 'image' && currentImages >= limits.images) {
    return { allowed: false, reason: `Daily image generation limit reached (${limits.images}/day on ${tier} plan).` }
  }
  if (kind === 'web_search' && currentWebSearch >= limits.web_search) {
    return { allowed: false, reason: `Daily web search limit reached (${limits.web_search}/day on ${tier} plan).` }
  }
  if (kind === 'chat' && currentChats >= limits.chats) {
    return { allowed: false, reason: `Daily chat message limit reached (${limits.chats}/day on ${tier} plan).` }
  }

  return { allowed: true, current_spend_cents: currentTotal, daily_limit_cents: limits.total }
}

export async function trackSpend(
  businessId: string,
  costCents: number,
  kind: CostKind,
): Promise<void> {
  try {
    await supabaseAdmin.rpc('track_aria_spend', {
      p_business_id: businessId,
      p_cost_cents: costCents,
      p_kind: kind,
    })
  } catch (e) {
    console.error('[cost-guard] tracking failed', e)
  }
}

export async function getDailySpend(businessId: string): Promise<{
  spent_cents: number
  limit_cents: number
  chats: number
  images: number
  web_searches: number
  tier: string
}> {
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('subscription_tier')
    .eq('id', businessId)
    .maybeSingle()

  const tier = (biz?.subscription_tier as string)?.toLowerCase() ?? 'starter'
  const limits = DAILY_LIMITS[tier] ?? DAILY_LIMITS.starter

  const today = new Date().toISOString().slice(0, 10)
  const { data: spend } = await supabaseAdmin
    .from('aria_daily_spend')
    .select('total_cost_cents, chat_count, image_count, web_search_count')
    .eq('business_id', businessId)
    .eq('day', today)
    .maybeSingle()

  return {
    spent_cents: spend?.total_cost_cents ?? 0,
    limit_cents: limits.total,
    chats: spend?.chat_count ?? 0,
    images: spend?.image_count ?? 0,
    web_searches: spend?.web_search_count ?? 0,
    tier,
  }
}
