import { z } from 'zod';

const FIRECRAWL_BASE_URL = process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev/v1';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

const UrlSchema = z.string().url();

type FirecrawlScrapeResponse = {
  success?: boolean;
  data?: {
    markdown?: string;
    html?: string;
    metadata?: Record<string, any>;
    links?: string[];
    screenshot?: string;
  };
  error?: string;
};

type FirecrawlCrawlResponse = {
  success?: boolean;
  data?: Array<{
    markdown?: string;
    html?: string;
    metadata?: Record<string, any>;
    url?: string;
    links?: string[];
  }>;
  error?: string;
};

function ensureFirecrawl() {
  if (!FIRECRAWL_API_KEY) {
    throw new Error('Missing FIRECRAWL_API_KEY');
  }
}

async function firecrawlRequest<T>(path: string, body: Record<string, any>): Promise<T> {
  ensureFirecrawl();

  const res = await fetch(`${FIRECRAWL_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firecrawl error ${res.status}: ${text || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export type ExtractedPage = {
  url: string;
  title?: string;
  description?: string;
  markdown: string;
  html?: string;
  links?: string[];
  screenshot?: string;
  metadata?: Record<string, any>;
};

export async function scrapeUrl(
  url: string,
  options?: {
    onlyMainContent?: boolean;
    includeHtml?: boolean;
    includeLinks?: boolean;
    screenshot?: boolean;
    waitFor?: number;
  }
): Promise<ExtractedPage> {
  const safeUrl = UrlSchema.parse(url);

  const data = await firecrawlRequest<FirecrawlScrapeResponse>('/scrape', {
    url: safeUrl,
    formats: options?.includeHtml ? ['markdown', 'html'] : ['markdown'],
    onlyMainContent: options?.onlyMainContent ?? true,
    includeLinks: options?.includeLinks ?? true,
    screenshot: options?.screenshot ?? false,
    waitFor: options?.waitFor ?? 1500,
  });

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to scrape URL');
  }

  return {
    url: safeUrl,
    title: data.data.metadata?.title,
    description: data.data.metadata?.description,
    markdown: data.data.markdown || '',
    html: data.data.html,
    links: data.data.links || [],
    screenshot: data.data.screenshot,
    metadata: data.data.metadata || {},
  };
}

export type CrawlResult = {
  startUrl: string;
  pages: ExtractedPage[];
};

export async function crawlSite(
  url: string,
  options?: {
    limit?: number;
    allowSubdomains?: boolean;
    includeHtml?: boolean;
  }
): Promise<CrawlResult> {
  const safeUrl = UrlSchema.parse(url);

  const data = await firecrawlRequest<FirecrawlCrawlResponse>('/crawl', {
    url: safeUrl,
    limit: options?.limit ?? 10,
    allowSubdomains: options?.allowSubdomains ?? false,
    scrapeOptions: {
      formats: options?.includeHtml ? ['markdown', 'html'] : ['markdown'],
      onlyMainContent: true,
    },
  });

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to crawl site');
  }

  return {
    startUrl: safeUrl,
    pages: data.data.map((page) => ({
      url: page.url || safeUrl,
      title: page.metadata?.title,
      description: page.metadata?.description,
      markdown: page.markdown || '',
      html: page.html,
      links: page.links || [],
      metadata: page.metadata || {},
    })),
  };
}

export async function summarisePublicUrl(url: string): Promise<{
  url: string;
  title?: string;
  content: string;
}> {
  const page = await scrapeUrl(url, {
    onlyMainContent: true,
    includeHtml: false,
    includeLinks: false,
    screenshot: false,
  });

  return {
    url: page.url,
    title: page.title,
    content: page.markdown.slice(0, 12000),
  };
}
