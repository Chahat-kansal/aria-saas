import type { CrawledPageData } from './crawler'

export interface ExtractedKeyword {
  keyword: string
  frequency: number
  found_on_pages: string[]
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'that', 'with', 'have', 'this', 'will', 'your', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'more', 'only', 'over', 'such', 'take', 'than', 'them', 'well', 'were', 'what', 'into', 'also', 'back', 'then', 'their', 'there', 'about', 'would', 'these', 'other', 'which', 'while', 'should', 'could', 'where', 'being', 'after', 'before', 'please', 'click', 'read', 'home', 'page', 'site', 'website', 'menu', 'contact', 'email', 'phone', 'address', 'copyright', 'rights', 'reserved', 'http', 'https', 'www', 'com', 'org', 'net', 'html',
])

const tokenize = (text: string): string[] =>
  text.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter(Boolean)

const isContentToken = (t: string) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t)

/**
 * Extract real keywords from crawled page bodies.
 * TF over 1–3 word phrases (phrases lightly boosted), top `limit`.
 */
export function extractKeywords(pages: CrawledPageData[], limit = 30): ExtractedKeyword[] {
  const freq = new Map<string, number>()
  const pagesByTerm = new Map<string, Set<string>>()

  const bump = (term: string, url: string) => {
    freq.set(term, (freq.get(term) ?? 0) + 1)
    const set = pagesByTerm.get(term) ?? new Set<string>()
    set.add(url)
    pagesByTerm.set(term, set)
  }

  for (const page of pages) {
    if (!page.isHtml || !page.bodyText) continue
    const tokens = tokenize(page.bodyText).filter(isContentToken)
    for (let i = 0; i < tokens.length; i++) {
      bump(tokens[i], page.url) // 1-gram
      if (i + 1 < tokens.length) bump(tokens[i] + ' ' + tokens[i + 1], page.url) // 2-gram
      if (i + 2 < tokens.length) bump(tokens[i] + ' ' + tokens[i + 1] + ' ' + tokens[i + 2], page.url) // 3-gram
    }
  }

  const score = (term: string, f: number) => f * (1 + 0.4 * (term.split(' ').length - 1))

  return [...freq.entries()]
    .filter(([, f]) => f >= 2)
    .sort((a, b) => score(b[0], b[1]) - score(a[0], a[1]))
    .slice(0, limit)
    .map(([keyword, frequency]) => ({
      keyword,
      frequency,
      found_on_pages: [...(pagesByTerm.get(keyword) ?? [])].slice(0, 10),
    }))
}
