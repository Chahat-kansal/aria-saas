export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { getWeatherForecast, getUpcomingHolidays } from '@/lib/external-apis';
import { trackUsage } from '@/lib/track-usage';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getRelevantImage } from '@/lib/images/pixabay'

function getNextPostTime(timeStr: string, _platform: string, _prefs: any): string {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const now = new Date();
  let targetDay = -1;
  let targetHour = 17;
  for (let i = 0; i < days.length; i++) {
    if (timeStr.includes(days[i])) { targetDay = i; break; }
  }
  const hourMatch = timeStr.match(/(\d+)(am|pm)/i);
  if (hourMatch) {
    targetHour = parseInt(hourMatch[1]);
    if (hourMatch[2].toLowerCase() === 'pm' && targetHour !== 12) targetHour += 12;
    if (hourMatch[2].toLowerCase() === 'am' && targetHour === 12) targetHour = 0;
  }
  const result = new Date(now);
  if (targetDay >= 0) {
    const daysUntil = (targetDay - now.getDay() + 7) % 7 || 7;
    result.setDate(result.getDate() + daysUntil);
  } else {
    result.setDate(result.getDate() + 1);
  }
  result.setHours(targetHour, 0, 0, 0);
  return result.toISOString();
}

const INDUSTRY_STRATEGIES: Record<string, string> = {
  retail: `RETAIL SOCIAL STRATEGY:
- Product showcases: feature top sellers with benefits, "Just arrived" urgency
- Seasonal relevance: connect products to weather, events, occasions
- Australian retail tone: friendly, no-nonsense, value-focused
- Responsible service of alcohol messaging when relevant
- Best platforms: Instagram (visual), Facebook (older demographic)
- Post timing: Thursday-Sunday; avoid Monday morning`,
  cafe: `CAFÉ SOCIAL STRATEGY:
- Morning content: post 6-9am for breakfast crowd
- Coffee art, specials, behind-the-scenes barista content
- FOMO from daily specials with limited availability
- Best platforms: Instagram (essential), Google Business (local discovery)
- Post timing: 6-8am, 11am-1pm lunch, Friday afternoon
- Hashtags: #MelbourneCafe #CoffeeLover #FlatWhite #AustralianCoffee`,
  restaurant: `RESTAURANT SOCIAL STRATEGY:
- Dish reveals, chef stories, sourcing from local producers
- Reservation prompts: "Book now for the weekend" with clear CTA
- Event promotion: degustations, wine pairing, themed events
- Best platforms: Instagram (discovery), Facebook (events/bookings), Google Business (reviews)
- Post timing: Tue-Thu evenings, Friday for weekend bookings`,
  warehouse: `WHOLESALE/B2B SOCIAL STRATEGY:
- Stock availability: new arrivals, bulk deal specials
- Industry expertise tips for business customers
- Reliability messaging: delivery times, quality, consistency`,
};

async function _POST(req: Request) {
  try {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, platforms, count: req_count } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const [
    { data: biz },
    { data: topItems },
    { data: prefs },
    { data: promotions },
  ] = await Promise.all([
    supabase.from('businesses').select('id,name,industry,city').eq('id', business_id).eq('user_id', user.id).maybeSingle(),
    supabase.from('pos_sale_items').select('product_name,quantity').eq('business_id', business_id).gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    supabase.from('social_preferences').select('*').eq('business_id', business_id).maybeSingle(),
    supabase.from('pos_promotions').select('name,discount_type,discount_value').eq('business_id', business_id).eq('is_active', true),
  ]);

  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  trackUsage({ business_id, event_type: 'social_suggest' });

  const weather = await getWeatherForecast(biz.city || 'Melbourne').catch(() => []);
  const holidays = getUpcomingHolidays(30, 'VIC');
  const hotWeekend = weather.slice(0, 7)
    .filter((d: any) => [5, 6, 0].includes(new Date(d.date).getDay()))
    .some((d: any) => d.is_hot);

  const productCounts: Record<string, number> = {};
  for (const item of (topItems || [])) {
    if (!item.product_name) continue;
    productCounts[item.product_name] = (productCounts[item.product_name] || 0) + item.quantity;
  }
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, qty]) => `${name} (${qty} sold this week)`);

  if (topProducts.length === 0) {
    return NextResponse.json({ posts: [], count: 0, status: 'skipped', reason: 'no_products' });
  }

  const strategyContext = INDUSTRY_STRATEGIES[biz.industry] || INDUSTRY_STRATEGIES.retail;
  const promoContext = (promotions || []).length > 0
    ? `ACTIVE PROMOTIONS: ${promotions!.map(p => `${p.name} (${p.discount_value}${p.discount_type === 'percentage' ? '%' : 'A$'} off)`).join(', ')}`
    : 'No active promotions';

  const requestedPlatforms: string[] = platforms || ['instagram', 'facebook'];
  const count = Math.min(req_count || 3, 5);

  const { ariaChat } = await import('@/lib/ai-router')
  const userPrompt = `Generate ${count} social media post suggestions for this business.

BUSINESS: ${biz.name}
INDUSTRY: ${biz.industry}
LOCATION: ${biz.city || 'Australia'}
TAGLINE: ${prefs?.business_tagline || 'Not set'}
TARGET AUDIENCE: ${prefs?.target_audience || 'Local community'}
BRAND VOICE: ${prefs?.brand_voice || 'friendly'}
TOPICS TO AVOID: ${prefs?.topics_to_avoid || 'None specified'}

SALES DATA THIS WEEK:
Top sellers: ${topProducts.join(', ')}
${promoContext}

EXTERNAL CONTEXT:
Weather this weekend: ${hotWeekend ? 'Hot (30°C+) — great for cold drinks/beer' : 'Mild/cool'}
Upcoming events: ${holidays.slice(0, 3).map((h: any) => `${h.name} in ${h.days_away} days`).join(', ') || 'None soon'}

PLATFORMS: ${requestedPlatforms.join(', ')}

Return ONLY a valid JSON array.`

  const text = await ariaChat('social_post', userPrompt, 800);
  let suggestions: any[] = [];
  try {
    suggestions = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return NextResponse.json({ posts: [], count: 0, status: 'error' }, { status: 200 });
  }

  const sbService = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  async function generatePostImage(prompt: string, searchQuery: string, prefix: string): Promise<{ url: string | null; credit: string | null; provider: string }> {
    // 1. Stability AI
    const stabilityKey = process.env.STABILITY_AI_KEY;
    if (stabilityKey && prompt) {
      try {
        const res = await fetch(
          'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${stabilityKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ text_prompts: [{ text: prompt, weight: 1 }], cfg_scale: 7, height: 1024, width: 1024, steps: 30, samples: 1 }),
          }
        );
        if (res.ok) {
          const d = await res.json();
          const buf = d.artifacts?.[0]?.base64 ? Buffer.from(d.artifacts[0].base64, 'base64') : null;
          if (buf) {
            const path = `social/${prefix}_sdxl.png`;
            const { error } = await sbService.storage.from('media').upload(path, buf, { contentType: 'image/png', upsert: true });
            if (!error) {
              const url = sbService.storage.from('media').getPublicUrl(path).data.publicUrl;
              return { url, credit: null, provider: 'stability_ai' };
            }
          }
        }
      } catch { /* fall through */ }
    }

    // 2. DALL-E 3
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && prompt) {
      try {
        const res = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'dall-e-3', prompt: prompt.slice(0, 1000), n: 1, size: '1024x1024', quality: 'standard' }),
        });
        if (res.ok) {
          const d = await res.json();
          const imgUrl = d.data?.[0]?.url;
          if (imgUrl) {
            const imgRes = await fetch(imgUrl);
            if (imgRes.ok) {
              const buf = Buffer.from(await imgRes.arrayBuffer());
              const path = `social/${prefix}_dalle3.png`;
              const { error } = await sbService.storage.from('media').upload(path, buf, { contentType: 'image/png', upsert: true });
              if (!error) {
                const url = sbService.storage.from('media').getPublicUrl(path).data.publicUrl;
                return { url, credit: null, provider: 'dalle3' };
              }
            }
          }
        }
      } catch { /* fall through */ }
    }

    // 3. Unsplash fallback
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    if (unsplashKey) {
      const q = searchQuery || prompt?.split(' ').slice(0, 3).join(' ') || '';
      try {
        const res = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=1&orientation=square`,
          { headers: { Authorization: `Client-ID ${unsplashKey}` } }
        );
        const d = await res.json();
        const photo = d.results?.[0];
        if (photo) return { url: photo.urls?.regular ?? photo.urls?.small, credit: photo.user?.name ?? 'Unsplash', provider: 'unsplash' };
      } catch { /* fall through */ }
    }

    // 4. Pixabay fallback (cached in Supabase Storage — no rate limit concern)
    try {
      const q = searchQuery || prompt?.split(' ').slice(0, 4).join(' ') || '';
      if (q) {
        const pixabayUrl = await getRelevantImage(q, { category: 'food', orientation: 'horizontal' });
        if (pixabayUrl) return { url: pixabayUrl, credit: null, provider: 'pixabay' };
      }
    } catch { /* fall through */ }

    return { url: null, credit: null, provider: 'none' };
  }

  // Generate images in parallel across all suggestions
  const imageResults = await Promise.all(
    suggestions.map((s: any, i: number) =>
      generatePostImage(s.image_prompt || '', s.image_search_query || '', `${business_id}/${Date.now()}_${i}`)
    )
  );

  const saved: any[] = [];
  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    const img = imageResults[i];
    const { data: post } = await supabase.from('social_posts').insert({
      business_id,
      platform: s.platform,
      status: 'scheduled',
      approval_status: 'approved',
      caption: s.caption,
      hashtags: [...(s.hashtags || []), ...(prefs?.auto_hashtags || [])],
      image_prompt: s.image_prompt,
      image_url: img.url,
      image_credit: img.credit,
      reel_concept: s.reel_concept ?? null,
      reel_script: s.reel_script ?? null,
      aria_reasoning: s.why,
      industry_context: s.industry_tip,
      scheduled_for: getNextPostTime(s.best_time || '', s.platform, prefs),
    }).select().single();
    if (post) saved.push({ ...post, topic: s.topic });
  }

  return NextResponse.json({ posts: saved, count: saved.length });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'timeout', message: 'Content generation timed out. Try again.' }, { status: 504 })
    }
    Sentry.captureException(err, { tags: { route: 'aria/social-suggest' } });
    return NextResponse.json({ posts: [], count: 0, status: 'error', message: 'temporarily_unavailable' }, { status: 200 });
  }
}

export const POST = withErrorCapture('aria/social-suggest', _POST)
