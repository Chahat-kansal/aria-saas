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
