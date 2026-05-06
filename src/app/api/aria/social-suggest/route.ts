export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { getWeatherForecast, getUpcomingHolidays } from '@/lib/external-apis';
import { trackUsage } from '@/lib/track-usage';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

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

export async function POST(req: Request) {
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
    supabase.from('businesses').select('id,name,industry,city,description').eq('id', business_id).eq('user_id', user.id).maybeSingle(),
    supabase.from('pos_sale_items').select('product_name,quantity').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
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

  const strategyContext = INDUSTRY_STRATEGIES[biz.industry] || INDUSTRY_STRATEGIES.retail;
  const promoContext = (promotions || []).length > 0
    ? `ACTIVE PROMOTIONS: ${promotions!.map(p => `${p.name} (${p.discount_value}${p.discount_type === 'percentage' ? '%' : 'A$'} off)`).join(', ')}`
    : 'No active promotions';

  const requestedPlatforms: string[] = platforms || ['instagram', 'facebook'];
  const count = Math.min(req_count || 3, 5);

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: ARIA_VOICE + '\n\n' + strategyContext,
    messages: [{
      role: 'user',
      content: `Generate ${count} social media post suggestions for this business.

BUSINESS: ${biz.name}
INDUSTRY: ${biz.industry}
LOCATION: ${biz.city || 'Australia'}
TAGLINE: ${prefs?.business_tagline || 'Not set'}
TARGET AUDIENCE: ${prefs?.target_audience || 'Local community'}
BRAND VOICE: ${prefs?.brand_voice || 'friendly'}
TOPICS TO AVOID: ${prefs?.topics_to_avoid || 'None specified'}

SALES DATA THIS WEEK:
Top sellers: ${topProducts.join(', ') || 'No sales data yet'}
${promoContext}

EXTERNAL CONTEXT:
Weather this weekend: ${hotWeekend ? 'Hot (30°C+) — great for cold drinks/beer' : 'Mild/cool'}
Upcoming events: ${holidays.slice(0, 3).map((h: any) => `${h.name} in ${h.days_away} days`).join(', ') || 'None soon'}

PLATFORMS TO POST ON: ${requestedPlatforms.join(', ')}

GENERATE ${count} posts. Vary the platforms. Each post should feel written by a real person at this business.

Return ONLY a valid JSON array, no other text:
[
  {
    "platform": "instagram" | "facebook" | "google_business",
    "caption": "the full post text, natural and authentic",
    "hashtags": ["relevant","hashtags","max8"],
    "best_time": "e.g. Friday 5pm or Monday 7am",
    "why": "1 sentence why this will perform well",
    "image_prompt": "detailed description of ideal photo for this post",
    "topic": "brief topic label",
    "industry_tip": "1 tip specific to this industry for this post type"
  }
]`,
    }],
  });

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]';
  let suggestions: any[] = [];
  try {
    suggestions = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
  }

  const saved: any[] = [];
  for (const s of suggestions) {
    const { data: post } = await supabase.from('social_posts').insert({
      business_id,
      platform: s.platform,
      status: 'draft',
      caption: s.caption,
      hashtags: [...(s.hashtags || []), ...(prefs?.auto_hashtags || [])],
      image_prompt: s.image_prompt,
      aria_reasoning: s.why,
      industry_context: s.industry_tip,
      scheduled_for: getNextPostTime(s.best_time || '', s.platform, prefs),
    }).select().single();
    if (post) saved.push({ ...post, topic: s.topic });
  }

  return NextResponse.json({ posts: saved, count: saved.length });
}
