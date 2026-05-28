export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { crawlSite, PAGE_CAP, type CrawledPageData } from '@/lib/seo/crawler'
import { analyzePage, computeHealthScore, type DetectedIssue } from '@/lib/seo/audit'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function pageRow(auditId: string, businessId: string, p: CrawledPageData) {
  return {
    audit_id: auditId, business_id: businessId, url: p.url,
    http_status: p.httpStatus,
    title: p.title, title_length: p.title?.length ?? 0,
    meta_description: p.metaDescription, meta_description_length: p.metaDescription?.length ?? 0,
    h1_count: p.h1s.length, word_count: p.wordCount,
    images_total: p.images.length, images_missing_alt: p.images.filter(i => !i.hasAlt).length,
    has_schema: p.hasJsonLd, load_ms: p.responseTimeMs,
    page_size_kb: p.pageSizeKb, depth: p.depth, parent_url: p.parentUrl,
    crawled_at: new Date().toISOString(),
  }
}

// Background crawl — writes pages incrementally, then analysis/keywords/AI fixes, then finalises.
async function runCrawl(auditId: string, businessId: string, websiteUrl: string) {
  try {
    await supabaseAdmin.from('seo_audits').update({ status: 'crawling', started_at: new Date().toISOString() }).eq('id', auditId)

    const result = await crawlSite(websiteUrl, {
      cap: PAGE_CAP,
      onPage: async (p, count) => {
        await supabaseAdmin.from('seo_pages').insert(pageRow(auditId, businessId, p))
        if (count % 5 === 0) await supabaseAdmin.from('seo_audits').update({ pages_crawled: count }).eq('id', auditId)
      },
    })

    if (result.blockedEverything) {
      await supabaseAdmin.from('seo_audits').update({
        status: 'complete', pages_crawled: 0, issues_found: 0, health_score: 0,
        error_detail: 'robots.txt disallows crawling every page on this site.',
        finished_at: new Date().toISOString(),
      }).eq('id', auditId)
      return
    }

    // On-page analysis → issues.
    const issues: DetectedIssue[] = []
    for (const p of result.pages) issues.push(...analyzePage(p))

    if (issues.length > 0) {
      await supabaseAdmin.from('seo_issues').insert(issues.map(i => ({
        business_id: businessId, audit_id: auditId, page_url: i.page_url, affected_url: i.page_url,
        issue_type: i.issue_type, severity: i.severity, title: i.title, detail: i.detail, state: 'open',
      })))
    }

    const score = computeHealthScore(issues)
    const counts = {
      critical_count: issues.filter(i => i.severity === 'critical').length,
      warning_count: issues.filter(i => i.severity === 'warning').length,
      info_count: issues.filter(i => i.severity === 'info').length,
    }

    await supabaseAdmin.from('seo_audits').update({
      status: 'complete', pages_crawled: result.pages.length,
      issues_found: issues.length, health_score: score, ...counts,
      finished_at: new Date().toISOString(),
    }).eq('id', auditId)
  } catch (e) {
    await supabaseAdmin.from('seo_audits').update({
      status: 'failed', error_detail: (e as Error).message?.slice(0, 500) ?? 'crawl error',
      finished_at: new Date().toISOString(),
    }).eq('id', auditId)
  }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { business_id?: string }
  const businessId = body.business_id
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id, website').eq('id', businessId).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const websiteRaw = (biz.website ?? '').toString().trim()
  if (!websiteRaw) {
    return NextResponse.json({ error: 'Website URL is missing — set it in the SEO page first.' }, { status: 400 })
  }
  let websiteUrl: string
  try { websiteUrl = new URL(/^https?:\/\//i.test(websiteRaw) ? websiteRaw : 'https://' + websiteRaw).href }
  catch { return NextResponse.json({ error: 'Website URL is invalid.' }, { status: 400 }) }

  // If a crawl is already running (started < 10 min ago), return it rather than starting another.
  const { data: running } = await supabaseAdmin.from('seo_audits')
    .select('id, started_at').eq('business_id', businessId).eq('status', 'crawling')
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (running && running.started_at && Date.now() - new Date(running.started_at).getTime() < 10 * 60 * 1000) {
    return NextResponse.json({ ok: true, audit_id: running.id, status: 'crawling', message: 'A crawl is already in progress.' })
  }

  // One crawl per business per 24h (prevents accidental DoS of the customer's own site).
  const { data: recent } = await supabaseAdmin.from('seo_audits')
    .select('id, finished_at').eq('business_id', businessId).eq('status', 'complete')
    .order('finished_at', { ascending: false }).limit(1).maybeSingle()
  if (recent?.finished_at && Date.now() - new Date(recent.finished_at).getTime() < ONE_DAY_MS) {
    const hrs = Math.ceil((ONE_DAY_MS - (Date.now() - new Date(recent.finished_at).getTime())) / (60 * 60 * 1000))
    return NextResponse.json({ error: `You can run one crawl per day. Try again in ~${hrs}h.`, audit_id: recent.id, status: 'rate_limited' }, { status: 429 })
  }

  const { data: created, error: createErr } = await supabaseAdmin.from('seo_audits').insert({
    business_id: businessId, website_url: websiteUrl, status: 'crawling', health_score: 0,
    pages_crawled: 0, issues_found: 0, issues_fixed: 0, created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
  }).select('id').single()
  if (createErr || !created) return NextResponse.json({ error: createErr?.message ?? 'Could not start audit' }, { status: 500 })

  // Fire-and-forget — return immediately, frontend polls /api/seo/audit/[id]/status.
  void runCrawl(created.id, businessId, websiteUrl)

  return NextResponse.json({ ok: true, audit_id: created.id, status: 'crawling' })
}

export const POST = withErrorCapture('seo/crawl', _POST)
