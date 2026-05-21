export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'
import { parseLLMJsonOr } from '@/lib/ai-json'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

const INDUSTRY_PROMPTS: Record<string, string> = {
  retail: 'Suggest realistic SKU, stock_quantity, low_stock_threshold, case_quantity, supplier_sku for an Australian retail product. Be conservative — only set fields where the product name strongly implies a value.',
  liquor: 'Suggest container_type, alcohol_percentage, standard_drinks, vintage (if wine), age_restricted=true for an Australian liquor product. Calculate standard_drinks as (volume_ml * alcohol_percentage / 1000) when both are knowable.',
  cafe: 'Suggest kds_station (barista/kitchen/cold), prep_time_seconds, allergens for an Australian cafe product. A flat white needs ~60s at barista station. Toast or eggs benedict are ~300s at kitchen.',
  bakery: 'Suggest shelf_life_days, allergens for an Australian bakery product. Fresh bread = 2 days, croissant = 1 day, dry biscuit = 30 days. Always declare gluten for wheat products.',
  restaurant: 'Suggest course_type, kds_station, prep_time_seconds, allergens for an Australian restaurant menu item. Entrees ~300s, mains ~600s, desserts ~120s.',
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { name, industry, partial } = await req.json() as { name?: string; industry?: string; partial?: Record<string, unknown> }
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const industryPrompt = INDUSTRY_PROMPTS[industry ?? 'retail'] ?? INDUSTRY_PROMPTS.retail

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 600,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
    messages: [{
      role: 'user',
      content: `You are filling in product fields for an Australian SMB POS.
Product name: "${name}"
Industry: ${industry ?? 'retail'}
Current partial draft (do not contradict): ${JSON.stringify(partial ?? {})}

${industryPrompt}

Return ONLY a JSON object with the fields to set. Omit any field you can't infer confidently.
Example for cafe "Flat White":
{ "kds_station": "barista", "prep_time_seconds": 60, "allergens": ["dairy"] }

Be conservative. Empty {} is fine if uncertain.`,
    }],
  })

  const raw = (message.content[0] as { text?: string }).text ?? '{}'
  const suggestion = parseLLMJsonOr<Record<string, unknown>>(raw, {}, 'aria/product-suggest')
  return NextResponse.json({ suggestion })
}

export const POST = withErrorCapture('aria/product-suggest', _POST)
