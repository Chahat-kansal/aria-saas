import type { CrawledPage } from './crawler';

export interface SeoIssue {
  issue_type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

export function auditPage(page: CrawledPage): SeoIssue[] {
  const issues: SeoIssue[] = [];

  if (!page.meta_description || page.meta_description_length === 0) {
    issues.push({
      issue_type: 'missing_meta_description',
      severity: 'high',
      title: 'Missing meta description',
      detail: 'This page has no meta description. Search engines use this as the snippet in results.',
    });
  }

  if (!page.title || page.title_length === 0) {
    issues.push({
      issue_type: 'missing_title',
      severity: 'high',
      title: 'Missing page title',
      detail: 'This page has no <title> tag. Title tags are critical for search ranking.',
    });
  }

  if (page.images_missing_alt > 0) {
    issues.push({
      issue_type: 'missing_alt_text',
      severity: 'high',
      title: 'Images missing alt text',
      detail: `${page.images_missing_alt} image${page.images_missing_alt > 1 ? 's' : ''} on this page lack an alt attribute. This hurts accessibility and image SEO.`,
    });
  }

  if (page.is_homepage && !page.has_schema) {
    issues.push({
      issue_type: 'missing_schema',
      severity: 'medium',
      title: 'No structured data (schema.org)',
      detail: 'The homepage has no JSON-LD schema markup. Adding LocalBusiness schema helps Google understand your business.',
    });
  }

  if (page.http_status === 404) {
    issues.push({
      issue_type: 'broken_link',
      severity: 'medium',
      title: 'Broken internal link (404)',
      detail: 'This URL is linked from your site but returns a 404 error. Fix or remove the link.',
    });
  }

  if (page.h1_count === 0 && page.http_status !== 404) {
    issues.push({
      issue_type: 'missing_h1',
      severity: 'medium',
      title: 'Missing H1 heading',
      detail: 'This page has no H1 tag. Every page should have exactly one H1 that describes the page topic.',
    });
  }

  if (page.word_count < 150 && page.http_status !== 404) {
    issues.push({
      issue_type: 'thin_content',
      severity: 'low',
      title: 'Thin content',
      detail: `This page has only ${page.word_count} words. Pages with fewer than 150 words may be considered thin content by search engines.`,
    });
  }

  if (page.load_ms > 3000) {
    issues.push({
      issue_type: 'slow_page',
      severity: 'low',
      title: 'Slow page load',
      detail: `This page took ${page.load_ms}ms to load. Pages taking over 3 seconds may be penalised in mobile search rankings.`,
    });
  }

  return issues;
}

export function computeHealthScore(issues: SeoIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'high') score -= 12;
    else if (issue.severity === 'medium') score -= 6;
    else if (issue.severity === 'low') score -= 3;
  }
  return Math.max(0, Math.floor(score));
}
