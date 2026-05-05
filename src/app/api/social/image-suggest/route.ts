export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

const INDUSTRY_CONTEXT: Record<string, string> = {
  cafe: 'coffee cafe latte flat white barista',
  restaurant: 'food restaurant plating chef cuisine',
  retail: 'product retail store bottle shop',
  warehouse: 'warehouse logistics business professional',
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query    = searchParams.get('query') ?? '';
  const industry = searchParams.get('industry') ?? 'retail';

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return NextResponse.json({ photos: [], error: 'UNSPLASH_ACCESS_KEY not configured' });
  }

  const context = INDUSTRY_CONTEXT[industry] ?? '';
  const enrichedQuery = [query, context].filter(Boolean).join(' ').slice(0, 100);

  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(enrichedQuery)}&per_page=8&orientation=square&content_filter=high`,
    { headers: { Authorization: `Client-ID ${accessKey}` } }
  );

  if (!res.ok) return NextResponse.json({ photos: [], error: 'Unsplash API error' });

  const data = await res.json();
  const photos = (data.results || []).map((p: any) => ({
    id: p.id,
    url: p.urls.regular,
    thumb: p.urls.thumb,
    small: p.urls.small,
    photographer: p.user.name,
    photographer_link: p.user.links.html,
  }));

  return NextResponse.json({ photos });
}
