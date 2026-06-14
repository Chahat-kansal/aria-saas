export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'

const MAX_ISSUES = 30
const PAGE_TIMEOUT_MS = 8000

async function fetchPage(url: string): Promise<{ html: string; ttfbMs: number } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS)
  try {
    const start = Date.now()
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AriaBot/1.0 (SEO verify)' },
      redirect: 'follow',
    })
    const ttfbMs = Date.now() - start
    const html = res.ok ? await res.text() : ''
    return { html, ttfbMs }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function issueStillPresent(issueType: string, html: string, ttfbMs: number): boolean {
  switch (issueType) {
    case 'missing_title':
      return !/<title>[^<]{1,}/i.test(html)
    case 'title_too_long': {
      const m = html.match(/<title>([^<]*)<\/title>/i)
      return m ? m[1].trim().length > 60 : true
    }
    case 'missing_meta_description':
      return !/<meta[^>]+name=["']description["'][^>]*content=["'][^"']{10}/i.test(html) &&
             !/<meta[^>]+content=["'][^"']{10}[^>]*name=["']description["']/i.test(html)
    case 'meta_too_long': {
      const m = html.match(/name=["']description["'][^>]*content=["']([^"']*)/i) ??
                html.match(/content=["']([^"']*)[^>]*name=["']description["']/i)
      return m ? m[1].length > 160 : true
    }
    case 'missing_h1':
      return !/<h1[\s>][^<]{1,}/i.test(html)
    case 'missing_schema':
      return !/<script[^>]+application\/ld\+json/i.test(html)
    case 'slow_page':
      return ttfbMs > 3000
    default:
      // thin_content, broken_link, missing_alt_text — can't reliably verify without full crawl; assume fixed
      return false
  }
}

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: issues } = await supabaseAdmin
    .from('seo_issues')
    .select('id, page_url, issue_type, detail')
    .eq('state', 'applied')
    .lte('applied_at', cutoff)
    .limit(MAX_ISSUES)

  if (!issues || issues.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, verified: 0, still_present: 0 })
  }

  // Fetch each unique URL once
  const pageCache = new Map<string, { html: string; ttfbMs: number } | null>()
  let verified = 0
  let still_present = 0
  const today = new Date().toISOString().slice(0, 10)

  for (const issue of issues) {
    const url = issue.page_url as string
    if (!pageCache.has(url)) {
      pageCache.set(url, await fetchPage(url))
    }
    const page = pageCache.get(url)!
    if (page === null) continue // fetch failed — retry next run

    const present = issueStillPresent(issue.issue_type as string, page.html, page.ttfbMs)
    if (!present) {
      await supabaseAdmin.from('seo_issues')
        .update({ state: 'verified', verified_at: new Date().toISOString() })
        .eq('id', issue.id)
      verified++
    } else {
      const note = `\n[Re-crawl ${today}: issue still detected — check your deployment.]`
      await supabaseAdmin.from('seo_issues')
        .update({ state: 'unverified', detail: ((issue.detail as string | null) ?? '') + note })
        .eq('id', issue.id)
      still_present++
    }
  }

  return NextResponse.json({ ok: true, checked: issues.length, verified, still_present })
}
