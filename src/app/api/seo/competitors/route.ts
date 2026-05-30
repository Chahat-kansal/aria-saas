export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { crawlSite, type CrawledPageData } from '@/lib/seo/crawler'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5-20251001'
const COMPETITOR_PAGE_CAP = 6

interface PageSummary {
  url: string
  title: string | null
  metaDescription: string | null
  h1s: string[]
  wordCount: number
  topKeywords: string[]
}

function extractTopKeywords(pages: CrawledPageData[]): string[] {
  const freq: Record<string, number> = {}
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'we', 'our', 'us', 'you', 'your', 'it', 'its', 'they', 'their',
  ])
  for (const p of pages) {
    if (!p.bodyText) continue
    const words = p.bodyText.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []
    for (const w of words) {
      if (!stopWords.has(w)) freq[w] = (freq[w] ?? 0) + 1
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([w]) => w)
}

function summarisePage(p: CrawledPageData): PageSummary {
  const words = p.bodyText ? p.bodyText.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [] : []
  const freq: Record<string, number> = {}
  const stop = new Set(['that', 'this', 'with', 'from', 'have', 'they', 'will', 'been', 'more', 'your', 'their', 'about'])
  for (const w of words) if (!stop.has(w)) freq[w] = (freq[w] ?? 0) + 1
  const topKeywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w)
  return { url: p.url, title: p.title, metaDescription: p.metaDescription, h1s: p.h1s, wordCount: p.wordCount, topKeywords }
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: analyses } = await supabaseAdmin
    .from('seo_competitor_analysis')
    .select('id, competitor_url, analysis, created_at')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({ analyses: analyses ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { business_id, competitor_url } = body as { business_id?: string; competitor_url?: string }
  if (!business_id || !competitor_url?.trim()) {
    return NextResponse.json({ error: 'business_id and competitor_url required' }, { status: 400 })
  }

  let competitorUrlNorm: string
  try {
    competitorUrlNorm = new URL(/^https?:\/\//i.test(competitor_url.trim()) ? competitor_url.trim() : 'https://' + competitor_url.trim()).href
  } catch {
    return NextResponse.json({ error: 'Invalid competitor URL' }, { status: 400 })
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, city, website, industry')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch our own SEO keywords for comparison
  const { data: ownKeywords } = await supabaseAdmin
    .from('seo_keywords')
    .select('keyword, current_rank, frequency')
    .eq('business_id', business_id)
    .order('frequency', { ascending: false })
    .limit(20)

  // Crawl competitor site (shallow, polite)
  const result = await crawlSite(competitorUrlNorm, {
    cap: COMPETITOR_PAGE_CAP,
    delayMs: 2000,
  })

  const htmlPages = result.pages.filter(p => p.isHtml && p.httpStatus < 400).slice(0, COMPETITOR_PAGE_CAP)
  const pageSummaries = htmlPages.map(summarisePage)
  const competitorKeywords = extractTopKeywords(htmlPages)

  // Build our keyword set for gap analysis
  const ourKeywordSet = new Set((ownKeywords ?? []).map(k => (k.keyword as string).toLowerCase()))
  const keywordGaps = competitorKeywords.filter(k => !ourKeywordSet.has(k)).slice(0, 15)
  const sharedKeywords = competitorKeywords.filter(k => ourKeywordSet.has(k)).slice(0, 10)

  // AI comparison
  let aiComparison = ''
  if (process.env.ANTHROPIC_API_KEY && htmlPages.length > 0) {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const bizName = (biz.name as string | null) ?? 'this business'
    const bizCity = (biz.city as string | null) ?? ''
    const bizIndustry = (biz.industry as string | null) ?? ''
    const competitorHost = new URL(competitorUrlNorm).hostname

    const prompt = `You are an SEO consultant for an Australian small business.

Business: ${bizName}${bizCity ? ` in ${bizCity}` : ''}${bizIndustry ? ` (${bizIndustry})` : ''}
Our tracked keywords: ${(ownKeywords ?? []).map(k => k.keyword).slice(0, 15).join(', ') || 'none yet'}

Competitor: ${competitorHost}
Their top pages:
${pageSummaries.slice(0, 4).map(p => `- ${p.url}: "${p.title}" | H1s: ${p.h1s.slice(0, 2).join(', ') || 'none'} | ${p.wordCount} words`).join('\n')}
Their top keywords: ${competitorKeywords.slice(0, 15).join(', ')}
Keyword gaps (they have, we don't): ${keywordGaps.slice(0, 10).join(', ') || 'none identified'}
Shared keywords: ${sharedKeywords.join(', ') || 'none'}

Write a 3-4 sentence analysis covering:
1. What SEO strengths the competitor demonstrates
2. The top 2-3 keyword gaps ${bizName} should target
3. One specific actionable recommendation to outrank them

Be direct and practical. No bullet points — flowing prose only.`

    try {
      const msg = await trackAICall(
        { route: 'seo/competitors', model: MODEL, businessId: business_id, purpose: 'competitor_analysis' },
        () => anthropic.messages.create({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
      )
      aiComparison = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    } catch { /* non-fatal */ }
  }

  const analysis = {
    competitor_hostname: new URL(competitorUrlNorm).hostname,
    pages_crawled: htmlPages.length,
    robots_found: result.robotsFound,
    page_summaries: pageSummaries,
    competitor_keywords: competitorKeywords,
    keyword_gaps: keywordGaps,
    shared_keywords: sharedKeywords,
    ai_comparison: aiComparison,
    analysed_at: new Date().toISOString(),
  }

  const { data: row, error: insertErr } = await supabaseAdmin
    .from('seo_competitor_analysis')
    .insert({ business_id, competitor_url: competitorUrlNorm, analysis })
    .select('id, competitor_url, analysis, created_at')
    .single()

  if (insertErr || !row) return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })

  return NextResponse.json({ ok: true, analysis: row })
}

export const GET = withErrorCapture('seo/competitors', _GET)
export const POST = withErrorCapture('seo/competitors', _POST)
