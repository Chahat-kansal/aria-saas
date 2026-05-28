import type { CrawledPageData, CrawlResult } from './crawler'

export type Severity = 'critical' | 'warning' | 'info'

export interface DetectedIssue {
  issue_type: string
  severity: Severity
  title: string
  detail: string
  page_url: string
}

export interface LocalResult {
  issues: DetectedIssue[]
  seoLocal: {
    gbp_completeness: number
    checklist: { item: string; ok: boolean }[]
  }
}

const SCORE_WEIGHTS: Record<Severity, number> = { critical: -10, warning: -3, info: -1 }
const WEAK_ANCHORS = new Set(['', 'click here', 'read more', 'here', 'more', 'link', 'this', 'learn more'])

export function computeHealthScore(issues: { severity: Severity }[]): number {
  let score = 100
  for (const i of issues) score += SCORE_WEIGHTS[i.severity] ?? 0
  return Math.round(Math.max(0, Math.min(100, score)))
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

// Per-page checks: titles, meta, headings, images, links, performance, SEO essentials.
export function analyzePage(page: CrawledPageData): DetectedIssue[] {
  const out: DetectedIssue[] = []
  const at = (issue_type: string, severity: Severity, title: string, detail: string) =>
    out.push({ issue_type, severity, title, detail, page_url: page.url })

  if (page.httpStatus === 0) {
    at('broken_page', 'critical', 'Page could not be loaded', 'This URL timed out or refused the connection during the crawl.')
    return out
  }
  if (page.httpStatus >= 400) {
    at('broken_link', 'critical', `Broken page (HTTP ${page.httpStatus})`, `This internal URL returned HTTP ${page.httpStatus}. Fix or remove links pointing to it.`)
    return out
  }
  if (!page.isHtml) return out

  if (!page.isHttps) {
    at('http_not_https', 'critical', 'Page served over HTTP', 'This page is not served over HTTPS. Install an SSL certificate and redirect HTTP→HTTPS.')
  }

  // ── Title tag ──
  const title = page.title?.trim() ?? ''
  if (!title) at('missing_title', 'critical', 'Missing title tag', 'This page has no <title> tag. Add a unique, descriptive title.')
  else if (title.length < 30) at('title_too_short', 'warning', 'Title too short', `The title is ${title.length} characters. Aim for 30–60 so it describes the page fully.`)
  else if (title.length > 60) at('title_too_long', 'warning', 'Title may be truncated in SERPs', `The title is ${title.length} characters. Titles over 60 are usually truncated by Google.`)

  // ── Meta description ──
  if (!page.metaDescription) {
    at('missing_meta_description', 'warning', 'Missing meta description', 'This page has no meta description. Search engines use it as the snippet text.')
  } else {
    const len = page.metaDescription.length
    if (len < 120) at('meta_description_short', 'info', 'Meta description is short', `The meta description is ${len} characters. 120–160 makes best use of the SERP snippet.`)
    else if (len > 160) at('meta_description_long', 'info', 'Meta description may be truncated', `The meta description is ${len} characters. Google truncates around 160.`)
  }

  // ── Headings ──
  if (page.h1s.length === 0) {
    at('missing_h1', 'critical', 'Missing H1 heading', 'Every page should have exactly one H1 describing its topic.')
  } else {
    if (page.h1s.length > 1) at('multiple_h1', 'warning', 'Multiple H1 headings', `This page has ${page.h1s.length} H1 tags. Use exactly one H1 per page.`)
    if (title && norm(page.h1s[0]) && norm(page.h1s[0]) === norm(title)) {
      at('h1_equals_title', 'info', 'H1 is identical to the title tag', 'The H1 matches the <title> word-for-word. Vary them so each targets the topic differently.')
    }
  }
  // Skipped heading levels (e.g. H1 → H3 with no H2)
  for (let i = 1; i < page.headingLevels.length; i++) {
    if (page.headingLevels[i] > page.headingLevels[i - 1] + 1) {
      at('heading_skip', 'info', 'Skipped heading level', `The heading order jumps from H${page.headingLevels[i - 1]} to H${page.headingLevels[i]}. Keep levels sequential for accessibility and structure.`)
      break
    }
  }

  // ── Images ──
  const missingAlt = page.images.filter(i => !i.hasAlt).length
  const emptyAlt = page.images.filter(i => i.emptyAlt).length
  if (missingAlt > 0) at('missing_alt_text', 'warning', 'Images missing alt text', `${missingAlt} of ${page.images.length} images have no alt attribute. Add descriptive alt text for accessibility and image SEO.`)
  if (emptyAlt > 0) at('empty_alt_text', 'info', 'Images with empty alt text', `${emptyAlt} image(s) use alt="". That is correct only for purely decorative images — confirm these aren't meaningful.`)

  // ── Links ──
  const extBlankNoOpener = page.links.filter(l => !l.internal && l.targetBlank && !l.relNoopener).length
  if (extBlankNoOpener > 0) at('link_no_noopener', 'info', 'External links missing rel="noopener"', `${extBlankNoOpener} external link(s) open in a new tab without rel="noopener". Add it to prevent tab-nabbing.`)
  const weak = page.links.filter(l => WEAK_ANCHORS.has(l.anchor.trim().toLowerCase())).length
  if (weak > 0) at('weak_anchor_text', 'info', 'Links with weak anchor text', `${weak} link(s) use vague anchor text like "click here" or have none. Use descriptive anchor text.`)

  // ── Performance (basic, no Lighthouse) ──
  if (page.pageSizeKb > 2048) at('large_page', 'warning', 'Page HTML over 2MB', `The HTML is ${(page.pageSizeKb / 1024).toFixed(1)}MB. Large pages load slowly — trim markup and defer assets.`)
  if (page.responseTimeMs > 3000) at('slow_ttfb', 'warning', 'Slow first byte', `The server took ${page.responseTimeMs}ms to respond (threshold 3000ms). Investigate hosting/caching.`)
  if (page.inlineScriptCount > 100) at('many_inline_scripts', 'info', 'Many inline scripts', `This page has ${page.inlineScriptCount} inline <script> blocks. Consolidate and defer where possible.`)

  // ── SEO essentials ──
  if (!page.canonical) at('missing_canonical', 'info', 'Missing canonical tag', 'Add <link rel="canonical"> so search engines know the preferred URL for this page.')
  if (!page.hasViewport) at('missing_viewport', 'critical', 'Missing viewport meta tag', 'Without <meta name="viewport"> the page is not mobile-friendly. Add: <meta name="viewport" content="width=device-width, initial-scale=1">.')
  if (!page.hasJsonLd) at('missing_schema', 'info', 'No structured data (JSON-LD)', 'Consider adding LocalBusiness schema so Google can show rich results for your business.')

  // ── Thin content ──
  if (page.wordCount > 0 && page.wordCount < 150) at('thin_content', 'info', 'Thin content', `This page has only ${page.wordCount} words. Thin pages rarely rank — consider expanding the copy.`)

  return out
}

// Duplicate titles / meta descriptions across the crawled set.
export function crossPageIssues(pages: CrawledPageData[]): DetectedIssue[] {
  const out: DetectedIssue[] = []
  const html = pages.filter(p => p.isHtml && p.httpStatus < 400)

  const group = (key: (p: CrawledPageData) => string | null) => {
    const m = new Map<string, string[]>()
    for (const p of html) {
      const v = key(p)
      if (!v) continue
      const k = norm(v)
      if (!k) continue
      const arr = m.get(k) ?? []
      arr.push(p.url)
      m.set(k, arr)
    }
    return m
  }

  for (const [, urls] of group(p => p.title)) {
    if (urls.length > 1) for (const u of urls) {
      out.push({ issue_type: 'duplicate_title', severity: 'warning', title: 'Duplicate title tag', detail: `This title is used on ${urls.length} pages. Each page should have a unique title.`, page_url: u })
    }
  }
  for (const [, urls] of group(p => p.metaDescription)) {
    if (urls.length > 1) for (const u of urls) {
      out.push({ issue_type: 'duplicate_meta_description', severity: 'warning', title: 'Duplicate meta description', detail: `This meta description is used on ${urls.length} pages. Write a unique description per page.`, page_url: u })
    }
  }
  return out
}

// Site-wide essentials (robots.txt / sitemap.xml presence).
export function siteIssues(result: CrawlResult): DetectedIssue[] {
  const out: DetectedIssue[] = []
  const home = result.startUrl
  if (!result.robotsFound) out.push({ issue_type: 'no_robots', severity: 'warning', title: 'No robots.txt', detail: 'No robots.txt was found. Add one at /robots.txt to guide crawlers and reference your sitemap.', page_url: home })
  if (!result.sitemapFound) out.push({ issue_type: 'no_sitemap', severity: 'warning', title: 'No sitemap.xml', detail: 'No sitemap.xml was found. Add one at /sitemap.xml so search engines can discover all your pages.', page_url: home })
  return out
}

// Local SEO checks (NAP, maps, schema) → seo_issues + seo_local payload.
export function localChecks(
  result: CrawlResult,
  biz: { address?: string | null; phone?: string | null }
): LocalResult {
  const pages = result.pages.filter(p => p.isHtml && p.httpStatus < 400)
  const home = pages.find(p => p.depth === 0) ?? pages[0] ?? null
  const homeUrl = home?.url ?? result.startUrl

  const addressOnHome = (() => {
    if (!biz.address || !home) return false
    const body = norm(home.bodyText)
    const addr = norm(biz.address)
    if (addr && body.includes(addr)) return true
    const first = norm(biz.address.split(',')[0] ?? '')
    return first.length > 4 ? body.includes(first) : false
  })()
  const hasAddressTag = pages.some(p => p.hasAddressTag)
  const hasTel = pages.some(p => p.hasTelLink)
  const hasMaps = pages.some(p => p.hasMapsLink)
  const hasSchema = pages.some(p => p.hasJsonLd)

  const issues: DetectedIssue[] = []
  if (biz.address && !addressOnHome) issues.push({ issue_type: 'address_missing', severity: 'warning', title: 'Address not found on home page', detail: 'Your business address is not visible on the home page. Show your full NAP (name, address, phone) so customers and Google can trust your location.', page_url: homeUrl })
  if (!hasAddressTag) issues.push({ issue_type: 'no_address_tag', severity: 'info', title: 'No <address> tag', detail: 'Wrap your contact details in an <address> element so assistive tech and crawlers recognise your NAP.', page_url: homeUrl })
  if (!hasTel) issues.push({ issue_type: 'no_tel_link', severity: 'info', title: 'No click-to-call link', detail: 'Add a tel: link (e.g. <a href="tel:+61...">) so mobile customers can call in one tap.', page_url: homeUrl })
  if (!hasMaps) issues.push({ issue_type: 'no_maps_link', severity: 'info', title: 'No Google Maps link or embed', detail: 'Link to or embed your Google Maps location to reinforce your local presence.', page_url: homeUrl })

  const checklist = [
    { item: 'Address shown on home page', ok: addressOnHome },
    { item: 'Uses an <address> tag', ok: hasAddressTag },
    { item: 'Click-to-call (tel:) link', ok: hasTel },
    { item: 'Google Maps link or embed', ok: hasMaps },
    { item: 'LocalBusiness structured data', ok: hasSchema },
  ]
  const gbp_completeness = Math.round((checklist.filter(c => c.ok).length / checklist.length) * 100)

  return { issues, seoLocal: { gbp_completeness, checklist } }
}
