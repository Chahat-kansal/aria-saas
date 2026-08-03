// SEO-ROBOTS-1 — ⚠ THIS FILE DOES NOT SERVE. public/robots.txt exists, and Next serves a static
// file from public/ in preference to this generated route, so edits here have no effect on
// production until that file is removed. The two were out of sync: this one disallowed /dashboard/
// and /onboarding/, the static one did not, so both were being crawled. public/robots.txt has been
// brought into line — KEEP THEM IN SYNC, or edit the static file instead.
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_URL ?? 'https://ariaos.site';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/pos/', '/api/', '/admin/', '/dashboard/', '/onboarding/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
