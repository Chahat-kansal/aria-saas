export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

import { NextResponse } from 'next/server'
import { lookup } from 'node:dns/promises'
import * as cheerio from 'cheerio'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// ── Shared types (component imports these via `import type`) ────────────────
export type SitePreview = {
  finalUrl: string
  title: string | null
  description: string | null
  ogImage: string | null
  favicon: string | null
  domain: string // www-stripped
  isHttps: boolean
}
export type SitePreviewError = {
  ok: false
  error: 'site_unreachable' | 'site_blocked' | 'invalid_url'
  message: string
}
export type SitePreviewResult = ({ ok: true } & SitePreview) | SitePreviewError

const UA = 'Mozilla/5.0 (compatible; AriaPreview/1.0; +https://ariaos.site)'
const TIMEOUT_MS = 7000
const MAX_BYTES = 2 * 1024 * 1024 // 2MB
const MAX_REDIRECTS = 5
const CACHE_TTL_MS = 5 * 60 * 1000
const RATE_LIMIT = 20 // previews per minute per user
const RATE_WINDOW_MS = 60 * 1000

// ── In-memory caches (per server instance — cheap rate-limit + dedupe) ──────
const previewCache = new Map<string, { result: SitePreviewResult; expires: number }>()
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function takeRateToken(userId: string): boolean {
  const now = Date.now()
  const b = rateBuckets.get(userId)
  if (!b || now > b.resetAt) {
    rateBuckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (b.count >= RATE_LIMIT) return false
  b.count++
  return true
}

// ── URL validation (cheap, pre-fetch) ──────────────────────────────────────
function validateUrl(raw: string): { url?: string; error?: string } {
  let v = (raw ?? '').toString().trim()
  if (!v) return { error: 'Enter a website address.' }
  if (/^(javascript|data|file|ftp|vbscript|blob):/i.test(v)) return { error: 'That link type is not allowed.' }
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v
  let u: URL
  try { u = new URL(v) } catch { return { error: "That doesn't look like a valid website." } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'Only http and https sites are supported.' }
  const host = u.hostname
  if (host.length < 4 || !host.includes('.')) return { error: "That doesn't look like a valid website." }
  if (host === 'localhost' || host.endsWith('.localhost')) return { error: 'Local addresses are not allowed.' }
  if (isIpLiteral(host)) return { error: 'Direct IP addresses are not allowed.' }
  return { url: u.href }
}

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

function isIpLiteral(host: string): boolean {
  const h = stripBrackets(host)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  if (h.includes(':')) return true // IPv6
  return false
}

// ── SSRF: block private / internal IP ranges (checked AFTER DNS resolution) ─
function isPrivateIp(raw: string): boolean {
  let ip = raw.trim().toLowerCase()
  const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) ip = mapped[1]

  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    const parts = ip.split('.').map(Number)
    if (parts.some(n => n > 255)) return true // malformed → block
    const [a, b] = parts
    if (a === 0) return true
    if (a === 10) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true // link-local
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a >= 224) return true // multicast / reserved
    return false
  }
  // IPv6
  if (ip === '::1' || ip === '::') return true
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true // fc00::/7 unique-local
  if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return true // fe80::/10 link-local
  return false
}

async function hostResolvesToPrivate(host: string): Promise<boolean> {
  const h = stripBrackets(host)
  if (isIpLiteral(host)) return isPrivateIp(h)
  try {
    const addrs = await lookup(h, { all: true })
    if (!addrs.length) return true // no DNS → treat as unreachable/blocked
    return addrs.some(a => isPrivateIp(a.address))
  } catch {
    return false // DNS error handled later as unreachable
  }
}

// Read the body with a hard byte cap so a giant/streaming response can't OOM us.
async function readCapped(res: Response, cap: number): Promise<string | null> {
  const reader = res.body?.getReader()
  if (!reader) {
    const txt = await res.text().catch(() => '')
    return txt.length > cap ? null : txt
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.length
      if (total > cap) { await reader.cancel().catch(() => {}); return null }
      chunks.push(value)
    }
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { merged.set(c, offset); offset += c.length }
  return new TextDecoder('utf-8').decode(merged)
}

async function fetchHtml(startUrl: string): Promise<{ finalUrl: string; html: string } | { error: SitePreviewError['error']; message: string }> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  let url = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL
    try { parsed = new URL(url) } catch { return { error: 'invalid_url', message: 'That redirected to an invalid address.' } }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { error: 'site_blocked', message: 'That site redirected to an unsupported address.' }
    if (await hostResolvesToPrivate(parsed.hostname)) return { error: 'site_blocked', message: 'That address points to a private network and was blocked.' }

    let res: Response
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal,
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      })
    } catch {
      return { error: 'site_unreachable', message: "We couldn't reach that site. Check the address and try again." }
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return { error: 'site_unreachable', message: 'That site returned an incomplete redirect.' }
      try { url = new URL(loc, url).href } catch { return { error: 'invalid_url', message: 'That site redirected to an invalid address.' } }
      continue
    }
    if (res.status >= 400) return { error: 'site_unreachable', message: `That site returned an error (HTTP ${res.status}).` }

    const ct = (res.headers.get('content-type') ?? '').toLowerCase()
    if (ct && !ct.includes('text/html') && !ct.includes('application/xhtml')) {
      return { error: 'site_unreachable', message: "That address didn't return a web page." }
    }
    const len = res.headers.get('content-length')
    if (len && Number(len) > MAX_BYTES) return { error: 'site_blocked', message: 'That page is too large to preview.' }

    const html = await readCapped(res, MAX_BYTES)
    if (html === null) return { error: 'site_blocked', message: 'That page is too large to preview.' }
    return { finalUrl: url, html }
  }
  return { error: 'site_unreachable', message: 'That site has too many redirects.' }
}

function absoluteUrl(raw: string | undefined, base: string): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw.trim(), base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch { return null }
}

function extract(html: string, finalUrl: string): SitePreview {
  const $ = cheerio.load(html)
  $('script, style, noscript, iframe, template').remove()

  const title =
    ($('meta[property="og:title"]').attr('content') || $('title').first().text() || '').trim() || null

  const description =
    ($('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '').trim() || null

  const ogImage = absoluteUrl($('meta[property="og:image"]').attr('content'), finalUrl)

  const iconHref =
    $('link[rel="icon"]').attr('href') ||
    $('link[rel="shortcut icon"]').attr('href') ||
    $('link[rel="apple-touch-icon"]').attr('href') ||
    undefined
  const origin = (() => { try { return new URL(finalUrl).origin } catch { return finalUrl } })()
  const favicon = absoluteUrl(iconHref, finalUrl) ?? `${origin}/favicon.ico`

  const u = new URL(finalUrl)
  return {
    finalUrl,
    title: title ? title.slice(0, 200) : null,
    description: description ? description.slice(0, 320) : null,
    ogImage,
    favicon,
    domain: u.hostname.replace(/^www\./, ''),
    isHttps: u.protocol === 'https:',
  }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ ok: false, error: 'invalid_url', message: 'Unauthorized' } as SitePreviewResult, { status: 401 })

  if (!takeRateToken(user.id)) {
    return NextResponse.json({ ok: false, error: 'site_blocked', message: 'Too many previews — wait a minute and try again.' } as SitePreviewResult, { status: 429 })
  }

  const body = await req.json().catch(() => ({})) as { url?: string }
  const { url, error } = validateUrl(body.url ?? '')
  if (error || !url) {
    return NextResponse.json({ ok: false, error: 'invalid_url', message: error ?? "That doesn't look like a valid website." } as SitePreviewResult, { status: 200 })
  }

  const cached = previewCache.get(url)
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.result)

  const fetched = await fetchHtml(url)
  if ('error' in fetched) {
    const result: SitePreviewResult = { ok: false, error: fetched.error, message: fetched.message }
    return NextResponse.json(result, { status: 200 })
  }

  const preview = extract(fetched.html, fetched.finalUrl)
  const result: SitePreviewResult = { ok: true, ...preview }
  previewCache.set(url, { result, expires: Date.now() + CACHE_TTL_MS })
  return NextResponse.json(result)
}

export const POST = withErrorCapture('site-preview', _POST)
