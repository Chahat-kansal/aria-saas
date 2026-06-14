export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface PlacesResult { name?: string; rating?: number; user_ratings_total?: number; place_id?: string; price_level?: number }

async function findPlace(name: string, city: string, key: string): Promise<PlacesResult | null> {
  try {
    const q = encodeURIComponent(`${name} ${city} Australia`);
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=name,rating,user_ratings_total,place_id,price_level&key=${key}`);
    const data = await res.json() as { candidates?: PlacesResult[] };
    return data.candidates?.[0] ?? null;
  } catch { return null; }
}

async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: 'no_places_key' });

  const { data: businesses } = await supabaseAdmin.from('businesses')
    .select('id, name, city, suburb, industry').eq('is_active', true);

  let totalWatches = 0, totalSnapshots = 0, totalAlerts = 0;

  for (const biz of businesses ?? []) {
    const city = (biz.suburb as string | null) ?? (biz.city as string | null) ?? 'Melbourne';
    const { data: watches } = await supabaseAdmin.from('aria_competitor_watches')
      .select('id, competitor_name').eq('business_id', biz.id).eq('is_active', true);

    for (const w of watches ?? []) {
      totalWatches++;
      const place = await findPlace(w.competitor_name as string, city, key);
      if (!place) continue;
      const rating = place.rating ?? null;
      const reviewCount = place.user_ratings_total ?? null;
      const priceIndex = place.price_level ?? null;

      // Get previous snapshot
      const { data: prevSnap } = await supabaseAdmin.from('competitor_snapshots')
        .select('rating, review_count')
        .eq('competitor_watch_id', w.id)
        .order('snapshot_date', { ascending: false }).limit(1).maybeSingle();

      // Insert snapshot
      await supabaseAdmin.from('competitor_snapshots').insert({
        business_id: biz.id,
        competitor_watch_id: w.id,
        competitor_name: w.competitor_name,
        rating, review_count: reviewCount, price_index: priceIndex,
        raw_data: { place_id: place.place_id },
      });
      totalSnapshots++;

      // Detect rating change
      if (prevSnap && rating != null && prevSnap.rating != null && Math.abs(Number(rating) - Number(prevSnap.rating)) >= 0.1) {
        const direction = Number(rating) > Number(prevSnap.rating) ? 'rose' : 'dropped';
        await supabaseAdmin.from('aria_competitor_alerts').insert({
          business_id: biz.id,
          competitor_name: w.competitor_name,
          alert_type: 'rating_change',
          message: `${w.competitor_name} rating ${direction} to ${rating} (was ${prevSnap.rating})`,
          data: { previous: prevSnap.rating, current: rating },
          is_read: false,
        });
        totalAlerts++;
      }

      // Detect review velocity spike
      if (prevSnap && reviewCount != null && prevSnap.review_count != null && Number(reviewCount) - Number(prevSnap.review_count) > 5) {
        const delta = Number(reviewCount) - Number(prevSnap.review_count);
        await supabaseAdmin.from('aria_competitor_alerts').insert({
          business_id: biz.id,
          competitor_name: w.competitor_name,
          alert_type: 'review_spike',
          message: `${w.competitor_name} received ${delta} new reviews — unusual spike`,
          data: { delta, total: reviewCount },
          is_read: false,
        });
        totalAlerts++;
      }
    }
  }

  return NextResponse.json({ ok: true, businesses: (businesses ?? []).length, watches: totalWatches, snapshots: totalSnapshots, alerts: totalAlerts });
}

export const GET = withErrorCapture('cron/competitor-monitor', _GET);
