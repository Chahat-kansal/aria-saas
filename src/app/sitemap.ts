import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_URL ?? 'https://ariaos.site';
const NOW = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, lastModified: NOW, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE}/pricing`, lastModified: NOW, changeFrequency: 'weekly', priority: 0.95 },
    { url: `${BASE}/demo`, lastModified: NOW, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${BASE}/vs/shopfront`, lastModified: NOW, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${BASE}/vs/square`, lastModified: NOW, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${BASE}/vs/lightspeed`, lastModified: NOW, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${BASE}/signup`, lastModified: NOW, changeFrequency: 'monthly', priority: 0.75 },
    { url: `${BASE}/login`, lastModified: NOW, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/privacy`, lastModified: NOW, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/terms`, lastModified: NOW, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/security`, lastModified: NOW, changeFrequency: 'monthly', priority: 0.5 },
  ];
}
