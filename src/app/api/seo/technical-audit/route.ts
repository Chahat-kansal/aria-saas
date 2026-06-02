export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

interface AuditCheck {
  id: string
  label: string
  result: 'pass' | 'fail' | 'warn'
  detail: string
}

async function fetchWithTimeout(url: string, opts?: RequestInit): Promise<Response> {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(8000) })
}

async function checkHttps(url: string): Promise<AuditCheck> {
  const id = 'https'
  if (!url.startsWith('https://')) {
    return { id, label: 'HTTPS', result: 'fail', detail: 'URL does not use HTTPS — Google penalises non-HTTPS sites.' }
  }
  try {
    const res = await fetchWithTimeout(url, { redirect: 'follow' })
    const finalUrl = res.url
    if (finalUrl.startsWith('https://')) {
      return { id, label: 'HTTPS', result: 'pass', detail: 'Site serves over HTTPS.' }
    }
    return { id, label: 'HTTPS', result: 'fail', detail: 'Final URL after redirects is not HTTPS: ' + finalUrl }
  } catch {
    return { id, label: 'HTTPS', result: 'warn', detail: 'Could not verify HTTPS — site may be down.' }
  }
}

async function checkMobileViewport(url: string): Promise<AuditCheck> {
  const id = 'mobile_viewport'
  try {
    const res = await fetchWithTimeout(url)
    const html = await res.text()
    const hasViewport = /<meta[^>]+name=["']viewport["'][^>]+content=["'][^"']*width=device-width/i.test(html)
    if (hasViewport) {
      return { id, label: 'Mobile viewport', result: 'pass', detail: 'Viewport meta tag with width=device-width is present.' }
    }
    return { id, label: 'Mobile viewport', result: 'fail', detail: 'Missing viewport meta tag — page will not render correctly on mobile.' }
  } catch {
    return { id, label: 'Mobile viewport', result: 'warn', detail: 'Could not fetch page to check viewport.' }
  }
}

async function checkSitemap(baseUrl: string): Promise<AuditCheck> {
  const id = 'sitemap'
  const origin = (() => { try { return new URL(baseUrl).origin } catch { return baseUrl } })()
  try {
    const res = await fetchWithTimeout(origin + '/sitemap.xml')
    if (res.ok) {
      return { id, label: 'Sitemap', result: 'pass', detail: '/sitemap.xml is accessible (HTTP ' + res.status + ').' }
    }
    return { id, label: 'Sitemap', result: 'fail', detail: '/sitemap.xml returned HTTP ' + res.status + ' — Google needs a sitemap to discover your pages.' }
  } catch {
    return { id, label: 'Sitemap', result: 'fail', detail: '/sitemap.xml is not accessible — create and submit a sitemap.' }
  }
}

async function checkRobots(baseUrl: string): Promise<AuditCheck> {
  const id = 'robots_txt'
  const origin = (() => { try { return new URL(baseUrl).origin } catch { return baseUrl } })()
  try {
    const res = await fetchWithTimeout(origin + '/robots.txt')
    if (!res.ok) {
      return { id, label: 'robots.txt', result: 'warn', detail: 'robots.txt not found (HTTP ' + res.status + '). Create one to manage crawler access.' }
    }
    const text = await res.text()
    const blocksAll = /Disallow:\s*\//.test(text) && /User-agent:\s*\*/.test(text)
    if (blocksAll) {
      return { id, label: 'robots.txt', result: 'fail', detail: 'robots.txt blocks all crawlers (Disallow: /) — this will prevent Google from indexing your site.' }
    }
    return { id, label: 'robots.txt', result: 'pass', detail: 'robots.txt exists and allows crawling.' }
  } catch {
    return { id, label: 'robots.txt', result: 'warn', detail: 'robots.txt not accessible — create one for crawler guidance.' }
  }
}

async function checkBrokenLinks(url: string): Promise<AuditCheck> {
  const id = 'broken_links'
  try {
    const res = await fetchWithTimeout(url)
    const html = await res.text()
    const origin = new URL(url).origin

    const links: string[] = []
    const re = /href=["']([^"'#?]+)["']/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null && links.length < 20) {
      const href = m[1]
      if (href.startsWith('/')) links.push(origin + href)
      else if (href.startsWith(origin)) links.push(href)
    }

    const checks = await Promise.allSettled(
      links.slice(0, 10).map(async (link) => {
        const r = await fetchWithTimeout(link, { method: 'HEAD' })
        return { link, ok: r.ok, status: r.status }
      })
    )

    const broken: string[] = []
    for (const c of checks) {
      if (c.status === 'fulfilled' && !c.value.ok) broken.push(c.value.link)
    }

    if (broken.length === 0) {
      return { id, label: 'Broken internal links', result: 'pass', detail: 'Checked ' + links.slice(0, 10).length + ' internal links — none broken.' }
    }
    return { id, label: 'Broken internal links', result: 'fail', detail: broken.length + ' broken link' + (broken.length > 1 ? 's' : '') + ' found: ' + broken.slice(0, 3).map(l => new URL(l).pathname).join(', ') }
  } catch {
    return { id, label: 'Broken internal links', result: 'warn', detail: 'Could not check links — ensure the site is publicly accessible.' }
  }
}

async function checkDuplicateTitles(url: string): Promise<AuditCheck> {
  const id = 'duplicate_titles'
  try {
    const homeRes = await fetchWithTimeout(url)
    const homeHtml = await homeRes.text()
    const homeTitle = homeHtml.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim()
    const origin = new URL(url).origin

    // Find a few linked pages to compare
    const linkRe = /href=["'](\/[^"'#?]+)["']/gi
    const paths = new Set<string>()
    let lm: RegExpExecArray | null
    while ((lm = linkRe.exec(homeHtml)) !== null && paths.size < 4) paths.add(lm[1])

    const titles: string[] = homeTitle ? [homeTitle] : []
    for (const path of paths) {
      try {
        const r = await fetchWithTimeout(origin + path)
        const h = await r.text()
        const t = h.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim()
        if (t) titles.push(t)
      } catch { /* skip */ }
    }

    const unique = new Set(titles.map(t => t.toLowerCase()))
    if (titles.length < 2) {
      return { id, label: 'Duplicate titles', result: 'pass', detail: 'Could not fetch enough pages to compare titles.' }
    }
    if (unique.size < titles.length) {
      const dups = titles.filter((t, i) => titles.findIndex(x => x.toLowerCase() === t.toLowerCase()) !== i)
      return { id, label: 'Duplicate titles', result: 'fail', detail: 'Duplicate title tags found: "' + dups[0] + '" appears on multiple pages.' }
    }
    return { id, label: 'Duplicate titles', result: 'pass', detail: 'Checked ' + titles.length + ' pages — no duplicate title tags.' }
  } catch {
    return { id, label: 'Duplicate titles', result: 'warn', detail: 'Could not check for duplicate titles.' }
  }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { business_id, website_url } = body as { business_id?: string; website_url?: string }
  if (!business_id || !website_url?.trim()) {
    return NextResponse.json({ error: 'business_id and website_url required' }, { status: 400 })
  }

  let url: string
  try {
    const raw = website_url.trim()
    url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw).href
  } catch {
    return NextResponse.json({ error: 'Invalid website URL' }, { status: 400 })
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Run all checks in parallel
  const [httpsCheck, mobileCheck, sitemapCheck, robotsCheck, linksCheck, titlesCheck] = await Promise.all([
    checkHttps(url),
    checkMobileViewport(url),
    checkSitemap(url),
    checkRobots(url),
    checkBrokenLinks(url),
    checkDuplicateTitles(url),
  ])

  const allChecks = [httpsCheck, mobileCheck, sitemapCheck, robotsCheck, linksCheck, titlesCheck]
  const passed = allChecks.filter(c => c.result === 'pass')
  const failed = allChecks.filter(c => c.result === 'fail')
  const warnings = allChecks.filter(c => c.result === 'warn')

  // Score: 100 - (20 per fail) - (5 per warn), min 0
  const score = Math.max(0, 100 - failed.length * 20 - warnings.length * 5)

  // Persist to seo_audits with a technical type note
  await supabaseAdmin.from('seo_audits').insert({
    business_id,
    status: 'complete',
    pages_crawled: 1,
    issues_found: failed.length + warnings.length,
    issues_fixed: 0,
    health_score: score,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  }).then(() => {/* non-fatal if fails */})

  return NextResponse.json({
    score,
    passed: passed.map(c => ({ id: c.id, label: c.label, detail: c.detail })),
    failed: failed.map(c => ({ id: c.id, label: c.label, detail: c.detail })),
    warnings: warnings.map(c => ({ id: c.id, label: c.label, detail: c.detail })),
    checked_at: new Date().toISOString(),
    url,
  })
}

export const POST = withErrorCapture('seo/technical-audit', _POST)
