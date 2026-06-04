export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { waitUntil } from '@vercel/functions'
import Anthropic from '@anthropic-ai/sdk'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function fetchWebsiteHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Googlebot' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch { return null }
}

function hasLocalBusinessSchema(html: string): boolean {
  return html.includes('"@type":"LocalBusiness"') ||
    html.includes('"@type": "LocalBusiness"') ||
    html.includes("'LocalBusiness'") ||
    html.toLowerCase().includes('localbusiness')
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { business_id } = body as { business_id?: string }
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, trading_name, address, city, phone, abn, industry, google_place_id, google_average_rating, google_total_reviews, website, email')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 1. NAP (Name, Address, Phone) completeness
  const napFields = {
    name: !!(biz.name || biz.trading_name),
    address: !!(biz.address && biz.city),
    phone: !!biz.phone,
  }
  const napScore = Math.round((Object.values(napFields).filter(Boolean).length / 3) * 100)
  const napConsistent = napScore === 100

  // 2. GBP completeness
  const gbpFields = ['name', 'address', 'city', 'phone', 'industry', 'website', 'abn', 'google_place_id'] as const
  const filled = gbpFields.filter(f => biz[f] != null && String(biz[f]).trim() !== '').length
  const gbpCompleteness = Math.round((filled / gbpFields.length) * 100)
  const gbpListed = !!biz.google_place_id
  const reviewCount = biz.google_total_reviews ?? null
  const reviewAvg = biz.google_average_rating ?? null

  // 3. LocalBusiness schema check on website
  let hasSchema = false
  let websiteHtml = ''
  if (biz.website) {
    websiteHtml = (await fetchWebsiteHtml(biz.website as string)) ?? ''
    hasSchema = websiteHtml ? hasLocalBusinessSchema(websiteHtml) : false
  }

  // 4. Local keyword opportunity check via AI analysis
  const industry = (biz.industry as string) || 'business'
  const suburb = (biz.city as string) || 'your area'
  const localKeyword = industry + ' ' + suburb

  // AI analysis: score issues and opportunities
  const analysisPrompt = `Analyse the local SEO signals for this Australian business and return JSON.

Business: ${biz.name || biz.trading_name}
Industry: ${industry}
Location: ${biz.address || ''}, ${suburb}
Phone: ${biz.phone || 'not set'}
Website: ${biz.website || 'not set'}
Google Place ID: ${biz.google_place_id || 'not connected'}
Google Reviews: ${reviewCount ?? 0} (avg ${reviewAvg ?? 'unknown'}/5)
NAP completeness: ${napScore}%
LocalBusiness schema on website: ${hasSchema ? 'YES' : 'NO'}

Return JSON only:
{
  "score": <integer 0-100>,
  "nap_consistent": <boolean>,
  "issues": ["string", ...],
  "opportunities": ["string", ...],
  "local_keywords": ["${localKeyword}", ...]
}`

  let score = Math.round((napScore + gbpCompleteness) / 2)
  let issues: string[] = []
  let opportunities: string[] = []
  let localKeywords: string[] = [localKeyword]

  try {
    const msg = await trackAICall(
      { route: 'seo/local-scan', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'local-seo-analysis' },
      () => anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: analysisPrompt }],
      })
    )

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    if (typeof parsed.score === 'number') score = Math.max(0, Math.min(100, parsed.score))
    if (Array.isArray(parsed.issues)) issues = parsed.issues.slice(0, 8).map(String)
    if (Array.isArray(parsed.opportunities)) opportunities = parsed.opportunities.slice(0, 6).map(String)
    if (Array.isArray(parsed.local_keywords)) localKeywords = parsed.local_keywords.slice(0, 5).map(String)
  } catch { /* use fallback values */ }

  // Build detailed checklist
  const checklist = [
    { item: 'Business name set', ok: napFields.name },
    { item: 'Address & city set', ok: napFields.address },
    { item: 'Phone number set', ok: napFields.phone },
    { item: 'Industry / category set', ok: !!biz.industry },
    { item: 'Website linked', ok: !!biz.website },
    { item: 'Google Place ID connected', ok: gbpListed },
    { item: 'Has Google reviews', ok: (reviewCount ?? 0) > 0 },
    { item: 'LocalBusiness schema on website', ok: hasSchema },
    { item: '4+ star average rating', ok: (reviewAvg ?? 0) >= 4 },
    { item: 'ABN registered', ok: !!biz.abn },
  ]

  const payload = {
    business_id,
    gbp_completeness: gbpCompleteness,
    gbp_listed: gbpListed,
    review_count: reviewCount,
    review_avg: reviewAvg,
    map_pack_rank: null,
    citations_total: null,
    citations_consistent: napConsistent ? 1 : 0,
    review_velocity_30d: null,
    checklist,
    scanned_at: new Date().toISOString(),
  }

  const { error: upsertErr } = await supabaseAdmin
    .from('seo_local')
    .upsert(payload, { onConflict: 'business_id' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  waitUntil((async () => { await supabaseAdmin.from('aria_autopilot_actions').insert({
    business_id, action_type: 'seo_local_scan', status: 'executed',
    action_data: { score, nap_consistent: napConsistent, has_schema: hasSchema, issues_count: issues.length },
  }) })())

  return NextResponse.json({
    ok: true,
    score,
    gbp_completeness: gbpCompleteness,
    gbp_listed: gbpListed,
    nap_consistent: napConsistent,
    has_schema: hasSchema,
    issues,
    opportunities,
    local_keywords: localKeywords,
    review_count: reviewCount,
    review_avg: reviewAvg,
    checklist,
  })
}

export const POST = withErrorCapture('seo/local-scan', _POST)
