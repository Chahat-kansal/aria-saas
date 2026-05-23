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
  liquor: 'Suggest container_type (bottle/can/keg/cask), alcohol_percentage, standard_drinks, vintage (if wine/spirit), volume (in ml), age_restricted=true, country_of_origin for an Australian liquor product. Calculate standard_drinks as volume_ml * abv_pct / 1000 when knowable. Search web to find real ABV if unsure.',
  cafe: 'Suggest kds_station (barista/kitchen/cold), prep_time_seconds, allergens, is_vegan, is_vegetarian, is_gluten_free for an Australian cafe product. A flat white needs ~60s at barista station.',
  bakery: 'Suggest shelf_life_days, allergens, is_gluten_free, is_vegan, ingredients for an Australian bakery product. Fresh bread = 2 days, croissant = 1 day, dry biscuit = 30 days.',
  restaurant: 'Suggest course_type, kds_station, prep_time_seconds, allergens, is_vegan, is_vegetarian for an Australian restaurant menu item. Entrees ~300s, mains ~600s, desserts ~120s.',
  fashion: 'Suggest colour, size, gender (Men/Women/Unisex/Kids), material (Cotton/Polyester/etc), fit_type (Slim/Regular/Relaxed), brand, country_of_origin for a clothing product. Do NOT suggest expiry_date. Search web for accurate brand/material if product name implies a known brand.',
  pharmacy: 'Suggest schedule_level (None (OTC)/S2/S3/S4/S8), shelf_life_days, storage_temp, allergens, requires_script, is_schedule_drug for a pharmacy product. Search web for AU schedule classification if name implies a specific medication.',
  convenience: 'Suggest barcode (if name implies a well-known product), shelf_life_days, storage_temp (Ambient/Refrigerated/Frozen), allergens, is_age_restricted, gst_exempt (true for fresh food only) for a convenience store product.',
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

  // content may have tool_use blocks before the text block — find the text
  const raw = (message.content.find(b => b.type === 'text') as { text: string } | undefined)?.text ?? '{}'
  const suggestion = parseLLMJsonOr<Record<string, unknown>>(raw, {}, 'aria/product-suggest')
  return NextResponse.json({ suggestion })
}

export const POST = withErrorCapture('aria/product-suggest', _POST)
