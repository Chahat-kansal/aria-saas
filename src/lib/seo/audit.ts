import type { CrawledPageData } from './crawler'

export type Severity = 'critical' | 'warning' | 'info'

export interface DetectedIssue {
  issue_type: string
  severity: Severity
  title: string
  detail: string
  page_url: string
}

const SCORE_WEIGHTS: Record<Severity, number> = { critical: -10, warning: -3, info: -1 }

export function computeHealthScore(issues: { severity: Severity }[]): number {
  let score = 100
  for (const i of issues) score += SCORE_WEIGHTS[i.severity] ?? 0
  return Math.round(Math.max(0, Math.min(100, score)))
}

// Foundational per-page checks. Expanded with the full ruleset in the issue-detection pass.
export function analyzePage(page: CrawledPageData): DetectedIssue[] {
  const out: DetectedIssue[] = []
  const at = (issue_type: string, severity: Severity, title: string, detail: string) =>
    out.push({ issue_type, severity, title, detail, page_url: page.url })

  // Unreachable / broken pages — nothing else is meaningful, so stop here.
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
    at('http_not_https', 'critical', 'Page served over HTTP', 'This page is not served over HTTPS. Search engines and browsers penalise insecure pages — install an SSL certificate and redirect HTTP→HTTPS.')
  }

  // Title tag
  const title = page.title?.trim() ?? ''
  if (!title) at('missing_title', 'critical', 'Missing title tag', 'This page has no <title> tag. Add a unique, descriptive title.')
  else if (title.length < 30) at('title_too_short', 'warning', 'Title too short', `The title is ${title.length} characters. Aim for 30–60 so it describes the page fully.`)
  else if (title.length > 60) at('title_too_long', 'warning', 'Title may be truncated in SERPs', `The title is ${title.length} characters. Titles over 60 are usually truncated by Google.`)

  // Meta description
  if (!page.metaDescription) at('missing_meta_description', 'warning', 'Missing meta description', 'This page has no meta description. Search engines use it as the snippet text.')

  // Headings
  if (page.h1s.length === 0) at('missing_h1', 'critical', 'Missing H1 heading', 'Every page should have exactly one H1 describing its topic.')

  // Mobile-friendliness
  if (!page.hasViewport) at('missing_viewport', 'critical', 'Missing viewport meta tag', 'Without <meta name="viewport"> the page is not mobile-friendly. Add: <meta name="viewport" content="width=device-width, initial-scale=1">.')

  // Thin content
  if (page.wordCount > 0 && page.wordCount < 150) at('thin_content', 'info', 'Thin content', `This page has only ${page.wordCount} words. Thin pages rarely rank — consider expanding the copy.`)

  return out
}
