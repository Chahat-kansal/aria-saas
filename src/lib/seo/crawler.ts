import * as cheerio from 'cheerio'

export const UA = 'Mozilla/5.0 (compatible; AriaSEOBot/1.0; +https://ariaos.site/seo-bot)'
export const PAGE_CAP = 50
export const POLITE_DELAY_MS = 1500
export const TIMEOUT_MS = 10_000
const MAX_HTML_BYTES = 3 * 1024 * 1024

const SKIP_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|ico|css|js|json|xml|zip|gz|rar|mp4|mp3|wav|avi|mov|woff2?|ttf|eot|doc|docx|xls|xlsx|ppt|pptx)(\?|$)/i
// Query keys that typically spawn infinite parameter variants — we keep only the base path.
const LOOP_PARAM = /[?&](page|sort|filter|orderby|order|view|p|start|offset|tag|category)=/i

export interface PageLink {
  href: string
  anchor: string
  internal: boolean
  targetBlank: boolean
  relNoopener: boolean
}

export interface CrawledPageData {
  url: string
  depth: number
  parentUrl: string | null
  httpStatus: number
  responseTimeMs: number
  pageSizeKb: number
  isHtml: boolean
  isHttps: boolean
  title: string | null
  metaDescription: string | null
  canonical: string | null
  hasViewport: boolean
  h1s: string[]
  headingLevels: number[]
  images: { hasAlt: boolean; emptyAlt: boolean }[]
  links: PageLink[]
  hasJsonLd: boolean
  inlineScriptCount: number
  wordCount: number
  bodyText: string
  hasAddressTag: boolean
  hasTelLink: boolean
  hasMapsLink: boolean
}

export interface CrawlResult {
  pages: CrawledPageData[]
  robotsFound: boolean
  sitemapFound: boolean
  blockedEverything: boolean
  startUrl: string
  hostname: string
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function normaliseStart(raw: string): URL | null {
  try { return new URL(raw.startsWith('http') ? raw : 'https://' + raw) } catch { return null }
}

// Strip hash + loop-y query params so ?page=2 etc collapse to one canonical variant.
function canonicaliseInternal(href: string, base: URL): string | null {
  try {
    const u = new URL(href, base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (u.hostname !== base.hostname) return null
    u.hash = ''
    if (LOOP_PARAM.test(u.search)) u.search = ''
    return u.href
  } catch { return null }
}

async function fetchRobots(origin: string): Promise<{ found: boolean; disallow: string[] }> {
  try {
    const res = await fetchWithTimeout(origin + '/robots.txt')
    if (!res.ok) return { found: false, disallow: [] }
    const text = await res.text()
    const disallow: string[] = []
    let relevant = false
    for (const raw of text.split('\n')) {
      const line = raw.split('#')[0].trim()
      if (/^user-agent:/i.test(line)) {
        const agent = line.slice(11).trim().toLowerCase()
        relevant = agent === '*' || agent.includes('ariaseobot')
      } else if (relevant && /^disallow:/i.test(line)) {
        const path = line.slice(9).trim()
        if (path) disallow.push(path)
      }
    }
    return { found: true, disallow }
  } catch { return { found: false, disallow: [] } }
}

function isDisallowed(pathname: string, rules: string[]): boolean {
  for (const rule of rules) {
    if (rule === '/') return true
    if (pathname.startsWith(rule)) return true
  }
  return false
}

async function fetchWithTimeout(url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { method, signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': UA } })
  } finally { clearTimeout(timer) }
}

function parseHtml(url: string, html: string, base: URL): Omit<CrawledPageData, 'url' | 'depth' | 'parentUrl' | 'httpStatus' | 'responseTimeMs' | 'pageSizeKb' | 'isHtml' | 'isHttps'> {
  const $ = cheerio.load(html)

  const title = $('title').first().text().trim() || null
  const metaDescription = ($('meta[name="description"]').attr('content') ?? '').trim() || null
  const canonical = ($('link[rel="canonical"]').attr('href') ?? '').trim() || null
  const hasViewport = $('meta[name="viewport"]').length > 0
  const hasJsonLd = $('script[type="application/ld+json"]').length > 0
  const inlineScriptCount = $('script:not([src])').length

  const h1s: string[] = []
  $('h1').each((_, el) => { h1s.push($(el).text().trim()) })

  const headingLevels: number[] = []
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    const tag = ($(el).prop('tagName') ?? '').toString().toLowerCase()
    if (/^h[1-6]$/.test(tag)) headingLevels.push(Number(tag[1]))
  })

  const images: { hasAlt: boolean; emptyAlt: boolean }[] = []
  $('img').each((_, el) => {
    const alt = $(el).attr('alt')
    images.push({ hasAlt: alt !== undefined, emptyAlt: alt !== undefined && alt.trim() === '' })
  })

  const links: PageLink[] = []
  let hasTelLink = false
  let hasMapsLink = false
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').trim()
    if (!href) return
    if (/^tel:/i.test(href)) { hasTelLink = true; return }
    if (/^mailto:/i.test(href)) return
    if (/(google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl)/i.test(href)) hasMapsLink = true
    let internal = false
    try { internal = new URL(href, base).hostname === base.hostname } catch { /* anchor / junk */ return }
    const rel = ($(el).attr('rel') ?? '').toLowerCase()
    links.push({
      href, anchor: $(el).text().trim().slice(0, 120), internal,
      targetBlank: ($(el).attr('target') ?? '') === '_blank',
      relNoopener: rel.includes('noopener'),
    })
  })

  const hasAddressTag = $('address').length > 0
  const iframeMaps = $('iframe[src*="google.com/maps"], iframe[src*="maps.google"]').length > 0
  if (iframeMaps) hasMapsLink = true

  $('script, style, noscript, template').remove()
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
  const wordCount = bodyText ? bodyText.split(' ').filter(Boolean).length : 0

  return {
    title, metaDescription, canonical, hasViewport, h1s, headingLevels, images, links,
    hasJsonLd, inlineScriptCount, wordCount, bodyText, hasAddressTag, hasTelLink, hasMapsLink,
  }
}

async function readCapped(res: Response): Promise<{ text: string; bytes: number }> {
  const reader = res.body?.getReader()
  if (!reader) { const t = await res.text(); return { text: t, bytes: t.length } }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.length
      if (total > MAX_HTML_BYTES) { await reader.cancel().catch(() => {}); break }
      chunks.push(value)
    }
  }
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let off = 0
  for (const c of chunks) { merged.set(c, off); off += c.length }
  return { text: new TextDecoder('utf-8').decode(merged), bytes: total }
}

/**
 * Crawl a site: same-host BFS, robots.txt-respecting, politely delayed.
 * `onPage` fires after each page so the caller can persist incrementally.
 */
export async function crawlSite(
  websiteUrl: string,
  opts: { cap?: number; delayMs?: number; onPage?: (p: CrawledPageData, count: number) => Promise<void> | void } = {}
): Promise<CrawlResult> {
  const cap = Math.min(opts.cap ?? PAGE_CAP, PAGE_CAP)
  const delayMs = opts.delayMs ?? POLITE_DELAY_MS

  const base = normaliseStart(websiteUrl)
  if (!base) return { pages: [], robotsFound: false, sitemapFound: false, blockedEverything: true, startUrl: websiteUrl, hostname: '' }

  const { found: robotsFound, disallow } = await fetchRobots(base.origin)
  let sitemapFound = false
  try {
    const sm = await fetchWithTimeout(base.origin + '/sitemap.xml', 'HEAD')
    sitemapFound = sm.ok || sm.status === 405 // 405 → exists but no HEAD
    if (!sitemapFound) { const g = await fetchWithTimeout(base.origin + '/sitemap.xml'); sitemapFound = g.ok }
  } catch { sitemapFound = false }

  const startHref = canonicaliseInternal(base.href, base) ?? base.href
  const queue: { url: string; depth: number; parent: string | null }[] = [{ url: startHref, depth: 0, parent: null }]
  const seen = new Set<string>([startHref])
  const pages: CrawledPageData[] = []
  let skippedByRobots = 0

  while (queue.length > 0 && pages.length < cap) {
    const { url, depth, parent } = queue.shift()!
    let pathname: string
    try { pathname = new URL(url).pathname } catch { continue }
    if (SKIP_EXT.test(url)) continue
    if (isDisallowed(pathname, disallow)) { skippedByRobots++; continue }

    if (pages.length > 0) await sleep(delayMs) // polite delay between requests

    const t0 = Date.now()
    let res: Response
    try { res = await fetchWithTimeout(url) }
    catch {
      const errPage: CrawledPageData = blankPage(url, depth, parent, 0, Date.now() - t0, 0, base)
      pages.push(errPage); await opts.onPage?.(errPage, pages.length); continue
    }
    const responseTimeMs = Date.now() - t0
    const ct = (res.headers.get('content-type') ?? '').toLowerCase()
    const isHtml = ct.includes('text/html') || ct.includes('application/xhtml')

    if (!isHtml) {
      // Log the fetch (status matters for broken-link detection) but don't parse non-HTML.
      try { await res.body?.cancel() } catch { /* noop */ }
      const p = blankPage(url, depth, parent, res.status, responseTimeMs, 0, base); p.isHtml = false
      pages.push(p); await opts.onPage?.(p, pages.length); continue
    }

    const { text: html, bytes } = await readCapped(res)
    const parsed = parseHtml(url, html, base)
    const page: CrawledPageData = {
      url, depth, parentUrl: parent, httpStatus: res.status, responseTimeMs,
      pageSizeKb: Math.round(bytes / 1024), isHtml: true, isHttps: new URL(url).protocol === 'https:',
      ...parsed,
    }
    pages.push(page)
    await opts.onPage?.(page, pages.length)

    if (res.status < 400) {
      for (const link of parsed.links) {
        if (!link.internal) continue
        const norm = canonicaliseInternal(link.href, base)
        if (!norm || seen.has(norm) || SKIP_EXT.test(norm)) continue
        seen.add(norm)
        queue.push({ url: norm, depth: depth + 1, parent: url })
      }
    }
  }

  const blockedEverything = pages.length === 0 && skippedByRobots > 0
  return { pages, robotsFound, sitemapFound, blockedEverything, startUrl: base.href, hostname: base.hostname }
}

function blankPage(url: string, depth: number, parent: string | null, status: number, rt: number, kb: number, base: URL): CrawledPageData {
  let isHttps = false
  try { isHttps = new URL(url).protocol === 'https:' } catch { isHttps = base.protocol === 'https:' }
  return {
    url, depth, parentUrl: parent, httpStatus: status, responseTimeMs: rt, pageSizeKb: kb,
    isHtml: false, isHttps, title: null, metaDescription: null, canonical: null, hasViewport: false,
    h1s: [], headingLevels: [], images: [], links: [], hasJsonLd: false, inlineScriptCount: 0,
    wordCount: 0, bodyText: '', hasAddressTag: false, hasTelLink: false, hasMapsLink: false,
  }
}
