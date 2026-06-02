export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-5-20250929'

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AriaSEO/1.0)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.text()
}

function extractMeta(html: string) {
  const title = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? null
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)?.[1]?.trim()
    ?? html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i)?.[1]?.trim()
    ?? null
  const h1s: string[] = []
  const h1Re = /<h1[^>]*>([\s\S]{1,200}?)<\/h1>/gi
  let m: RegExpExecArray | null
  while ((m = h1Re.exec(html)) !== null && h1s.length < 5) {
    const text = m[1].replace(/<[^>]+>/g, '').trim()
    if (text) h1s.push(text)
  }
  const hasSchema = /<script[^>]+type=["']application\/ld\+json["']/i.test(html)
  const wordCount = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').split(' ').filter(Boolean).length
  return { title, desc, h1s, hasSchema, wordCount }
}

function extractInternalLinks(html: string, baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin
  const links = new Set<string>()
  const re = /href=["']([^"'#?]+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null && links.size < 30) {
    const href = m[1]
    if (href.startsWith('/') || href.startsWith(origin)) {
      const full = href.startsWith('/') ? origin + href : href
      if (full !== baseUrl) links.add(full)
    }
  }
  return [...links].slice(0, 10)
}

function extractTopKeywords(html: string): string[] {
  const stop = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','can','this','that','these','those','we','our','us','you','your','it','its','they','their','from','not','also','more','all','about','than','into','some','when','what','which','there','their','here','so'])
  const text = html.replace(/<[^>]+>/g, ' ').toLowerCase()
  const words = text.match(/\b[a-z]{4,}\b/g) ?? []
  const freq: Record<string, number> = {}
  for (const w of words) if (!stop.has(w)) freq[w] = (freq[w] ?? 0) + 1
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([w]) => w)
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

  let compUrl: string
  try {
    const raw = competitor_url.trim()
    compUrl = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw).href
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

  // Fetch our own keyword data for comparison
  const { data: ourKeywordsRaw } = await supabaseAdmin
    .from('seo_keywords')
    .select('keyword, current_rank')
    .eq('business_id', business_id)
    .order('current_rank', { ascending: true })
    .limit(20)
  const ourKeywords = (ourKeywordsRaw ?? []) as Array<{ keyword: string; current_rank: number | null }>

  // Fetch our own last audit score + issues
  const { data: ourAudit } = await supabaseAdmin
    .from('seo_audits')
    .select('health_score, issues_found, issues_fixed, pages_crawled')
    .eq('business_id', business_id)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Crawl competitor homepage (polite, single page + a few linked pages)
  let compPages: Array<{ url: string; title: string | null; desc: string | null; h1s: string[]; hasSchema: boolean; wordCount: number }> = []
  let compKeywords: string[] = []
  let crawlError: string | null = null

  try {
    const homeHtml = await fetchPage(compUrl)
    const homeMeta = extractMeta(homeHtml)
    compPages.push({ url: compUrl, ...homeMeta })
    compKeywords = extractTopKeywords(homeHtml)

    // Crawl up to 3 more internal pages
    const internalLinks = extractInternalLinks(homeHtml, compUrl)
    const pageFetches = internalLinks.slice(0, 3).map(async (link) => {
      try {
        const html = await fetchPage(link)
        return { url: link, ...extractMeta(html) }
      } catch { return null }
    })
    const morePages = await Promise.all(pageFetches)
    for (const p of morePages) if (p) compPages.push(p)
  } catch (e) {
    crawlError = e instanceof Error ? e.message : 'Fetch failed'
    compPages = []
  }

  const ourKeywordSet = new Set(ourKeywords.map(k => k.keyword.toLowerCase()))
  const keywordGaps = compKeywords.filter(k => !ourKeywordSet.has(k)).slice(0, 15)
  const sharedKeywords = compKeywords.filter(k => ourKeywordSet.has(k)).slice(0, 10)

  // Sonnet analysis
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const bizName = (biz.name as string | null) ?? 'this business'
  const bizCity = (biz.city as string | null) ?? ''
  const bizIndustry = (biz.industry as string | null) ?? ''
  const compHost = (() => { try { return new URL(compUrl).hostname } catch { return compUrl } })()

  const prompt = `You are a senior SEO strategist analysing a competitor for an Australian small business.

OUR BUSINESS: ${bizName}${bizCity ? ' in ' + bizCity : ''}${bizIndustry ? ' (' + bizIndustry + ')' : ''}
Our health score: ${ourAudit ? ourAudit.health_score + '/100' : 'unknown'}
Our tracked keywords: ${ourKeywords.slice(0, 12).map(k => k.keyword + (k.current_rank ? ' (#' + k.current_rank + ')' : '')).join(', ') || 'none yet'}

COMPETITOR: ${compHost}
Pages crawled: ${compPages.length}${crawlError ? ' (crawl error: ' + crawlError + ')' : ''}
${compPages.slice(0, 4).map(p => `- ${p.url}
  Title: ${p.title ?? 'none'}
  H1s: ${p.h1s.slice(0, 2).join(' | ') || 'none'}
  Schema markup: ${p.hasSchema ? 'yes' : 'no'}
  Word count: ~${p.wordCount}`).join('\n')}

Competitor top keywords: ${compKeywords.slice(0, 15).join(', ') || 'could not extract'}
Keywords they use that we don't track: ${keywordGaps.slice(0, 10).join(', ') || 'none'}
Keywords we share: ${sharedKeywords.join(', ') || 'none'}

Respond with ONLY valid JSON in this exact structure — no preamble, no markdown:
{
  "their_strengths": ["strength 1", "strength 2", "strength 3"],
  "our_opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
  "keyword_gaps": ["keyword 1", "keyword 2", "keyword 3", "keyword 4", "keyword 5"],
  "summary": "2-3 sentence strategic analysis"
}`

  let aiResult: { their_strengths: string[]; our_opportunities: string[]; keyword_gaps: string[]; summary: string } = {
    their_strengths: compPages.length > 0 ? ['Established web presence', 'Multiple indexed pages', 'Content depth'] : ['Web presence exists'],
    our_opportunities: ['Target keyword gaps identified above', 'Improve schema markup', 'Increase content depth'],
    keyword_gaps: keywordGaps.slice(0, 5),
    summary: 'Competitor analysis complete. ' + keywordGaps.length + ' keyword gaps identified.',
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const msg = await trackAICall(
        { route: 'seo/competitor-analysis', model: MODEL, businessId: business_id, purpose: 'competitor_analysis' },
        () => anthropic.messages.create({ model: MODEL, max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
      )
      const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
      const parsed = JSON.parse(raw.replace(/^```json|```$/g, '').trim())
      aiResult = {
        their_strengths: Array.isArray(parsed.their_strengths) ? parsed.their_strengths : aiResult.their_strengths,
        our_opportunities: Array.isArray(parsed.our_opportunities) ? parsed.our_opportunities : aiResult.our_opportunities,
        keyword_gaps: Array.isArray(parsed.keyword_gaps) ? parsed.keyword_gaps : aiResult.keyword_gaps,
        summary: typeof parsed.summary === 'string' ? parsed.summary : aiResult.summary,
      }
    } catch { /* use fallback */ }
  }

  const { data: row, error: insErr } = await supabaseAdmin
    .from('seo_competitor_analysis')
    .insert({
      business_id,
      competitor_url: compUrl,
      analysis: {
        competitor_hostname: compHost,
        pages_crawled: compPages.length,
        crawl_error: crawlError,
        page_summaries: compPages,
        competitor_keywords: compKeywords,
        keyword_gaps: aiResult.keyword_gaps,
        shared_keywords: sharedKeywords,
        their_strengths: aiResult.their_strengths,
        our_opportunities: aiResult.our_opportunities,
        ai_comparison: aiResult.summary,
        analysed_at: new Date().toISOString(),
      },
    })
    .select('id, competitor_url, analysis, created_at')
    .single()

  if (insErr || !row) return NextResponse.json({ error: insErr?.message ?? 'Insert failed' }, { status: 500 })

  return NextResponse.json({
    ok: true,
    competitor_url: compUrl,
    their_strengths: aiResult.their_strengths,
    our_opportunities: aiResult.our_opportunities,
    keyword_gaps: aiResult.keyword_gaps,
    summary: aiResult.summary,
    analysis: row,
  })
}

export const POST = withErrorCapture('seo/competitor-analysis', _POST)
