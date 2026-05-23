import * as cheerio from 'cheerio';

const UA = 'AriaSEO/1.0 (+https://ariaos.site)';
const TIMEOUT_MS = 10_000;
const PAGE_CAP = 15;

export interface CrawledPage {
  url: string;
  http_status: number;
  title: string | null;
  title_length: number;
  meta_description: string | null;
  meta_description_length: number;
  h1_count: number;
  word_count: number;
  images_total: number;
  images_missing_alt: number;
  has_schema: boolean;
  load_ms: number;
  internal_links: string[];
  is_homepage: boolean;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRobotsTxt(base: string): Promise<Set<string>> {
  const disallowed = new Set<string>();
  try {
    const res = await fetchWithTimeout(base + '/robots.txt');
    if (!res.ok) return disallowed;
    const text = await res.text();
    let relevant = false;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (line.toLowerCase().startsWith('user-agent:')) {
        const agent = line.slice('user-agent:'.length).trim();
        relevant = agent === '*' || agent.toLowerCase() === 'ariaseo' || agent.toLowerCase() === 'ariaseo/1.0';
      }
      if (relevant && line.toLowerCase().startsWith('disallow:')) {
        const path = line.slice('disallow:'.length).trim();
        if (path) disallowed.add(path);
      }
    }
  } catch { /* ignore */ }
  return disallowed;
}

function isDisallowed(pathname: string, disallowed: Set<string>): boolean {
  for (const rule of disallowed) {
    if (rule === '/') return true;
    if (pathname.startsWith(rule)) return true;
  }
  return false;
}

function normaliseUrl(raw: string, base: URL): string | null {
  try {
    const u = new URL(raw, base);
    u.hash = '';
    u.search = '';
    if (u.hostname !== base.hostname) return null;
    return u.href;
  } catch { return null; }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function parsePage(url: string, html: string, loadMs: number, status: number, baseUrl: URL, isHomepage: boolean): Promise<CrawledPage> {
  const $ = cheerio.load(html);

  const title = $('title').first().text().trim() || null;
  const titleLength = title?.length ?? 0;

  const metaDesc = $('meta[name="description"]').attr('content')?.trim() ?? null;
  const metaDescLength = metaDesc?.length ?? 0;

  const h1Count = $('h1').length;

  $('script, style, noscript, nav, footer, header').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = countWords(bodyText);

  const imgs = $('img');
  const imagesTotal = imgs.length;
  let imagesMissingAlt = 0;
  imgs.each((_, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt === null || alt.trim() === '') imagesMissingAlt++;
  });

  const hasSchema = $('script[type="application/ld+json"]').length > 0;

  const internalLinks: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const norm = normaliseUrl(href, baseUrl);
    if (norm && !internalLinks.includes(norm)) internalLinks.push(norm);
  });

  return {
    url,
    http_status: status,
    title,
    title_length: titleLength,
    meta_description: metaDesc,
    meta_description_length: metaDescLength,
    h1_count: h1Count,
    word_count: wordCount,
    images_total: imagesTotal,
    images_missing_alt: imagesMissingAlt,
    has_schema: hasSchema,
    load_ms: loadMs,
    internal_links: internalLinks,
    is_homepage: isHomepage,
  };
}

export async function crawlSite(websiteUrl: string): Promise<CrawledPage[]> {
  let baseUrl: URL;
  try {
    baseUrl = new URL(websiteUrl.startsWith('http') ? websiteUrl : 'https://' + websiteUrl);
  } catch { return []; }

  const base = baseUrl.origin;
  const disallowed = await fetchRobotsTxt(base);
  const visited = new Set<string>();
  const queue: string[] = [base + '/'];
  const pages: CrawledPage[] = [];

  while (queue.length > 0 && pages.length < PAGE_CAP) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    let pathname: string;
    try { pathname = new URL(url).pathname; } catch { continue; }
    if (isDisallowed(pathname, disallowed)) continue;

    try {
      const start = Date.now();
      const res = await fetchWithTimeout(url);
      const loadMs = Date.now() - start;
      const status = res.status;
      const contentType = res.headers.get('content-type') ?? '';

      if (!contentType.includes('text/html')) continue;
      const html = await res.text();
      const isHomepage = pathname === '/' || pathname === '';
      const page = await parsePage(url, html, loadMs, status, baseUrl, isHomepage);
      pages.push(page);

      for (const link of page.internal_links) {
        if (!visited.has(link) && !queue.includes(link)) {
          try {
            const lp = new URL(link).pathname;
            if (!isDisallowed(lp, disallowed)) queue.push(link);
          } catch { /* skip */ }
        }
      }
    } catch { /* one failure must not abort the whole crawl */ }
  }

  // HEAD-check remaining internal links for 404 detection
  const linkedUrls = new Set<string>();
  for (const p of pages) {
    for (const l of p.internal_links) linkedUrls.add(l);
  }
  for (const url of linkedUrls) {
    if (visited.has(url)) continue;
    if (pages.length >= PAGE_CAP) break;
    visited.add(url);
    try {
      const pathname = new URL(url).pathname;
      if (isDisallowed(pathname, disallowed)) continue;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, headers: { 'User-Agent': UA } });
      clearTimeout(timer);
      if (res.status === 404) {
        pages.push({
          url, http_status: 404,
          title: null, title_length: 0,
          meta_description: null, meta_description_length: 0,
          h1_count: 0, word_count: 0,
          images_total: 0, images_missing_alt: 0,
          has_schema: false, load_ms: 0,
          internal_links: [], is_homepage: false,
        });
      }
    } catch { /* skip */ }
  }

  return pages;
}
