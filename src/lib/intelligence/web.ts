// Re-export web utilities from canonical source — no auth/DB dependencies
export {
  scrapeUrl,
  crawlSite,
  summarisePublicUrl,
} from '@/lib/web';

export type { ExtractedPage, CrawlResult } from '@/lib/web';
