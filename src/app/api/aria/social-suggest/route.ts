export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import * as Sentry from '@sentry/nextjs';
import { parseLLMJsonOr } from '@/lib/ai-json';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
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

  // Server-side guard: only connected platforms may generate posts (token-spend protection).
  const { data: connections } = await supabaseAdmin
    .from('social_connections')
    .select('platform')
    .eq('business_id', business_id)
    .eq('is_active', true);
  const connectedPlatforms: string[] = (connections ?? []).map(c => c.platform).filter(Boolean);
  if (connectedPlatforms.length === 0) {
    return NextResponse.json({ error: 'no_connections', message: 'Connect at least one social account before generating posts.', posts: [] }, { status: 400 });
  }

  const [
    { data: biz },
    { data: topItems },
    { data: prefs },
    { data: promotions },
  ] = await Promise.all([
    supabase.from('businesses').select('id,name,industry,city').eq('id', business_id).eq('user_id', user.id).maybeSingle(),
    supabaseAdmin.from('pos_sale_items').select('product_name,quantity').eq('business_id', business_id).gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    supabaseAdmin.from('social_preferences').select('*').eq('business_id', business_id).maybeSingle(),
    supabaseAdmin.from('pos_promotions').select('name,discount_percent,promotion_type').eq('business_id', business_id).eq('active', true),
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

  // If no recent sales, fall back to brand awareness content
  const productContext = topProducts.length > 0
    ? `Top products sold this week: ${topProducts.join(', ')}`
    : `Business type: ${biz.industry ?? 'retail'}. No sales recorded yet — generate general brand awareness content.`

  const strategyContext = INDUSTRY_STRATEGIES[biz.industry] || INDUSTRY_STRATEGIES.retail;
  const promoContext = (promotions || []).length > 0
    ? `ACTIVE PROMOTIONS: ${promotions!.map(p => `${p.name}${p.discount_percent ? ` (${p.discount_percent}% off)` : ''}`).join(', ')}`
    : 'No active promotions';

  const requestedPlatforms: string[] = (Array.isArray(platforms) && platforms.length > 0)
    ? platforms.filter((p: string) => connectedPlatforms.includes(p))
    : connectedPlatforms;
  // Hard guard: if filtering left nothing, abort before calling Anthropic.
  if (requestedPlatforms.length === 0) {
    return NextResponse.json({ error: 'no_matching_connections', message: 'None of the requested platforms are connected.', posts: [] }, { status: 400 });
  }
  const count = Math.min(req_count || 3, 5);
  // Cost telemetry — audit whether the connected-only fix reduced spend.
  console.log('[social-suggest] generate', JSON.stringify({ business_id, platforms: requestedPlatforms, count: requestedPlatforms.length, connected: connectedPlatforms.length }));

  const userPrompt = `Generate ${count} social media post suggestions for this business.

BUSINESS: ${biz.name}
INDUSTRY: ${biz.industry}
LOCATION: ${biz.city || 'Australia'}
TAGLINE: ${prefs?.business_tagline || 'Not set'}
TARGET AUDIENCE: ${prefs?.target_audience || 'Local community'}
BRAND VOICE: ${prefs?.brand_voice || 'friendly'}
TOPICS TO AVOID: ${prefs?.topics_to_avoid || 'None specified'}

SALES DATA THIS WEEK:
${productContext}
${promoContext}

EXTERNAL CONTEXT:
Weather this weekend: ${hotWeekend ? 'Hot (30°C+) — great for cold drinks/beer' : 'Mild/cool'}
Upcoming events: ${holidays.slice(0, 3).map((h: any) => `${h.name} in ${h.days_away} days`).join(', ') || 'None soon'}

PLATFORMS: ${requestedPlatforms.join(', ')}

Return ONLY a valid JSON array.`

  const _Anthropic = (await import('@anthropic-ai/sdk')).default
  const _client = new _Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const _msg = await _client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    system: `You are a social media manager for Australian small businesses. Generate posts that sound like a real person wrote them — not an AI or marketing department.

CAPTION RULES:
- Write like a real cafe/shop owner texting their regulars. Casual, warm, specific.
- NO emojis mid-sentence. Max 2 emojis per caption, at start or end only.
- NO marketing clichés: "excited to announce", "we are thrilled", "don't miss out", "coming soon"
- BE SPECIFIC: mention the actual product name, actual price if known, actual day/event
- AUSTRALIAN English: "flavour" not "flavor", "organised" not "organized"
- Max 2 sentences for Instagram. 3 sentences max for Facebook/Google.
- Sound like this: "Our chai latte has been flying today — if you haven't tried it yet, pop in before we close at 4. ☕"
- NOT like this: "We are excited to announce our amazing specials this Queen's Birthday weekend! AU Don't miss out!"

HASHTAGS:
- Return hashtags WITHOUT the # symbol (the UI adds it)
- Use real, specific hashtags: "SipCafe", "MelbourneCafe", "ChaiLatte" — not "CafeLife", "Coffee", "LocalBusiness"
- Max 6 hashtags, all lowercase except proper nouns

IMAGE SEARCH QUERY:
- 3-4 specific words for beautiful photography
- Examples: "latte art overhead", "flat white ceramic cup", "avocado toast rustic", "chai steam mug"
- Never: "cafe business", "happy customer", "store product"

Return ONLY a valid JSON array. Each post: platform, caption, hashtags (array, no # prefix), best_time, why, image_prompt, image_search_query, topic, industry_tip, reel_concept, reel_script.`,
    messages: [{ role: 'user', content: userPrompt }],
  })
  const text = _msg.content[0].type === 'text' ? _msg.content[0].text.trim() : '';
  if (!text) {
    return NextResponse.json({ posts: [], count: 0, status: 'error' }, { status: 200 });
  }
  let suggestions: any[] = [];
  try {
    suggestions = parseLLMJsonOr<any[]>(text, [], 'social-suggest', 'array');
  } catch {
    return NextResponse.json({ posts: [], count: 0, status: 'error' }, { status: 200 });
  }

  const sbService = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Use the smart generate-image API which has industry-aware, quality-focused image search
  async function generatePostImage(prompt: string, searchQuery: string, _prefix: string): Promise<{ url: string | null; credit: string | null; provider: string }> {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ariaos.site'
      const res = await fetch(`${baseUrl}/api/social/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-call': 'true' },
        body: JSON.stringify({ prompt, search_query: searchQuery, business_id, industry: biz?.industry }),
      })
      if (!res.ok) return { url: null, credit: null, provider: 'none' }
      const d = await res.json() as { image_url?: string | null; credit?: string | null; provider?: string }
      return { url: d.image_url ?? null, credit: d.credit ?? null, provider: d.provider ?? 'none' }
    } catch { return { url: null, credit: null, provider: 'none' } }
  }

  // Save posts immediately without waiting for images
  const saved: any[] = [];
  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    const { data: post } = await supabaseAdmin.from('social_posts').insert({
      business_id,
      platform: s.platform,
      status: 'draft',
      approval_status: 'pending',
      caption: s.caption,
      hashtags: [...(s.hashtags || []), ...(prefs?.auto_hashtags || [])],
      image_prompt: s.image_prompt,
      image_url: null,
      image_credit: null,
      reel_concept: s.reel_concept ?? null,
      reel_script: s.reel_script ?? null,
      aria_reasoning: s.why,
      industry_context: s.industry_tip,
      scheduled_for: getNextPostTime(s.best_time || '', s.platform, prefs),
    }).select().single();
    if (post) saved.push({ ...post, topic: s.topic });
  }

  // Generate images async after returning — fire and forget
  void Promise.all(
    saved.map(async (post, i) => {
      const s = suggestions[i];
      const img = await generatePostImage(s.image_prompt || '', s.image_search_query || '', `${business_id}/${Date.now()}_${i}`).catch(() => ({ url: null, credit: null, provider: 'none' }));
      if (img.url) {
        await supabaseAdmin.from('social_posts').update({ image_url: img.url, image_credit: img.credit }).eq('id', post.id);
      }
    })
  );

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
