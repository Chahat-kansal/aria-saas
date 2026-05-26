export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import * as cheerio from 'cheerio'

interface CrawledPage {
  url: string
  statusCode: number
  loadTimeMs: number
  title: string | null
  metaDescription: string | null
  h1: string | null
  wordCount: number
  issues: PageIssue[]
}

interface PageIssue {
  type: string
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
}

function countWords(text: string): number {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length
}

function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base)
    u.hash = ''
    u.search = ''
    return u.href
  } catch { return null }
}

async function crawlPage(url: string): Promise<{ html: string; statusCode: number; loadTimeMs: number } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AriaOS-SEO-Crawler/1.0' },
      redirect: 'follow',
    })
    clearTimeout(timer)
    const loadTimeMs = Date.now() - t0
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) return null
    const html = await res.text()
    return { html, statusCode: res.status, loadTimeMs }
  } catch { clearTimeout(timer); return null }
}

function detectIssues(page: Omit<CrawledPage, 'issues'>): PageIssue[] {
  const issues: PageIssue[] = []
  if (page.statusCode >= 400) {
    issues.push({ type: 'broken_link', severity: 'high', title: 'Broken page', detail: `Page returned HTTP ${page.statusCode}.` })
    return issues
  }
  if (!page.title) issues.push({ type: 'missing_title', severity: 'high', title: 'Missing title tag', detail: 'Page has no <title> tag.' })
  else if (page.title.length > 60) issues.push({ type: 'title_too_long', severity: 'medium', title: 'Title too long', detail: `Title is ${page.title.length} characters (max 60).` })
  if (!page.metaDescription) issues.push({ type: 'missing_meta', severity: 'medium', title: 'Missing meta description', detail: 'Page has no <meta name="description">.' })
  else if (page.metaDescription.length > 160) issues.push({ type: 'meta_too_long', severity: 'medium', title: 'Meta description too long', detail: `Meta description is ${page.metaDescription.length} characters (max 160).` })
  if (!page.h1) issues.push({ type: 'missing_h1', severity: 'medium', title: 'Missing H1 heading', detail: 'Page has no <h1> tag.' })
  if (page.wordCount < 300 && page.wordCount > 0) issues.push({ type: 'thin_content', severity: 'low', title: 'Thin content', detail: `Page has only ${page.wordCount} words (recommended: 300+).` })
  if (page.loadTimeMs > 3000) issues.push({ type: 'slow_page', severity: 'medium', title: 'Slow page', detail: `Page loaded in ${page.loadTimeMs}ms (threshold: 3000ms).` })
  return issues
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { business_id, audit_id } = body as { business_id?: string; audit_id?: string }
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // Ownership check
  const { data: biz } = await supabase.from('businesses').select('id, website').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!biz.website) return NextResponse.json({ error: 'No website URL configured. Connect your website first.' }, { status: 400 })

  // Find or create audit
  let auditId: string
  if (audit_id) {
    auditId = audit_id
  } else {
    const { data: existing } = await supabaseAdmin
      .from('seo_audits').select('id').eq('business_id', business_id)
      .in('status', ['pending', 'crawling']).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (existing?.id) {
      // Reset stuck audits — mark as failed so we start fresh
      await supabaseAdmin.from('seo_audits').update({ status: 'failed' }).eq('id', existing.id)
    }
    {
      const { data: created, error: createErr } = await supabaseAdmin.from('seo_audits').insert({
        business_id, website_url: biz.website, status: 'pending', health_score: 0,
        pages_crawled: 0, issues_found: 0, issues_fixed: 0, created_at: new Date().toISOString(),
      }).select('id').single()
      if (createErr || !created) return NextResponse.json({ error: 'Failed to create audit' }, { status: 500 })
      auditId = created.id
    }
  }

  // Set crawling
  await supabaseAdmin.from('seo_audits').update({ status: 'crawling', started_at: new Date().toISOString() }).eq('id', auditId)

  // BFS crawl — up to 20 pages
  const startUrl = biz.website as string
  const domain = new URL(startUrl).hostname
  const visited = new Set<string>()
  const queue: string[] = [startUrl]
  const crawled: CrawledPage[] = []

  while (queue.length > 0 && crawled.length < 8) {
    const url = queue.shift()!
    const norm = normalizeUrl(url, startUrl)
    if (!norm || visited.has(norm)) continue
    visited.add(norm)

    const result = await crawlPage(norm)
    if (!result) {
      crawled.push({ url: norm, statusCode: 0, loadTimeMs: 0, title: null, metaDescription: null, h1: null, wordCount: 0, issues: [] })
      continue
    }

    const { html, statusCode, loadTimeMs } = result
    const $ = cheerio.load(html)
    const title = $('title').first().text().trim() || null
    const metaDescription = ($('meta[name="description"]').attr('content') ?? '').trim() || null
    const h1 = $('h1').first().text().trim() || null
    const bodyText = $('body').text()
    const wordCount = countWords(bodyText)

    // Collect same-domain links for queue
    if (statusCode < 400) {
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') ?? ''
        const linked = normalizeUrl(href, norm)
        if (linked && new URL(linked).hostname === domain && !visited.has(linked)) queue.push(linked)
      })
    }

    const pageData = { url: norm, statusCode, loadTimeMs, title, metaDescription, h1, wordCount }
    crawled.push({ ...pageData, issues: detectIssues(pageData) })
  }

  // Insert seo_pages + seo_issues
  let totalIssues = 0
  for (const page of crawled) {
    const { data: pageRow } = await supabaseAdmin.from('seo_pages').insert({
      audit_id: auditId, business_id, url: page.url, title: page.title,
      meta_description: page.metaDescription, h1: page.h1,
      status_code: page.statusCode, load_time_ms: page.loadTimeMs,
      word_count: page.wordCount, issues: page.issues,
      crawled_at: new Date().toISOString(),
    }).select('id').single()

    if (page.issues.length > 0 && pageRow?.id) {
      const issueRows = page.issues.map(iss => ({
        audit_id: auditId, business_id, page_url: page.url,
        page_id: pageRow.id, issue_type: iss.type, severity: iss.severity,
        title: iss.title, detail: iss.detail, state: 'open',
      }))
      await supabaseAdmin.from('seo_issues').insert(issueRows)
      totalIssues += page.issues.length
    }
  }

  // Score: start 100, -10 per critical (high), -5 per warning (medium), -2 per info (low)
  const allIssues = crawled.flatMap(p => p.issues)
  const score = Math.max(0, 100
    - allIssues.filter(i => i.severity === 'high').length * 10
    - allIssues.filter(i => i.severity === 'medium').length * 5
    - allIssues.filter(i => i.severity === 'low').length * 2
  )

  await supabaseAdmin.from('seo_audits').update({
    status: 'complete', health_score: score,
    pages_crawled: crawled.length, issues_found: totalIssues,
    finished_at: new Date().toISOString(),
  }).eq('id', auditId)

  return NextResponse.json({ ok: true, audit_id: auditId, pages_crawled: crawled.length, issues_found: totalIssues, score })
}

export const POST = withErrorCapture('seo/crawl', _POST)
