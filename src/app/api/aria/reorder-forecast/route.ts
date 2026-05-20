import * as Sentry from '@sentry/nextjs';
import Anthropic from '@anthropic-ai/sdk';
import { parseLLMJsonOr } from '@/lib/ai-json';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getBusinessItems, getBusinessSales } from '@/lib/business-data';
import { NextResponse } from 'next/server';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { getWeatherForecast, getUpcomingHolidays, getHolidayUplift, getWeatherUplift } from '@/lib/external-apis';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _POST(req: Request) {
  try {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, force_refresh } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: business } = await supabase.from('businesses')
    .select('id, name, industry, city, data_source').eq('id', business_id).eq('user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const today = new Date().toISOString().split('T')[0];
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  // Cache check
  if (!force_refresh) {
    const { data: cached } = await supabaseAdmin.from('reorder_forecasts')
      .select('forecast, generated_at').eq('business_id', business_id).eq('date', today).maybeSingle();
    if (cached && cached.generated_at > fourHoursAgo) {
      return NextResponse.json({ ...cached.forecast, cached: true });
    }
  }

  const dataSource = (business.data_source ?? 'aria_pos') as 'square' | 'aria_pos';
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const city = (business.city as string | null) ?? 'Melbourne';

  const [allItems, sales90, weatherForecast] = await Promise.all([
    getBusinessItems(business_id, dataSource),
    getBusinessSales(business_id, ninetyDaysAgo, dataSource),
    getWeatherForecast(city).catch(() => []),
  ]);

  const upcomingHolidays = getUpcomingHolidays(60, 'VIC');

  const limitedData = sales90.length === 0;

  const itemsWithReorder = allItems.filter(i => i.reorderPoint > 0);
  if (itemsWithReorder.length === 0) {
    return NextResponse.json({ items: [], upcoming_holidays: [], ai_summary: null, generated_at: new Date().toISOString(), cached: false });
  }

  // Sales last 30 days for velocity
  const sales30 = sales90.filter(s => s.soldAt >= thirtyDaysAgo);

  // Build unit-sold map per item (last 30 days)
  const unitsSold: Record<string, number> = {};
  for (const sale of sales30) {
    for (const li of sale.lineItems) {
      const key = li.itemId;
      unitsSold[key] = (unitsSold[key] ?? 0) + li.quantity;
    }
  }

  type ForecastItem = {
    item_id: string; item_name: string; current_stock: number;
    velocity_per_day: number; days_remaining: number; adjusted_days_remaining: number;
    holiday_uplift: number; suggested_order: number; recommended_order_date: string;
    urgency: 'critical' | 'high' | 'medium' | 'low'; unit: string;
  };

  const forecastItems: ForecastItem[] = itemsWithReorder
    .map((item): ForecastItem | null => {
      const sold30 = unitsSold[item.id] ?? unitsSold[item.externalId] ?? 0;
      const velocityPerDay = sold30 / 30;

        if (velocityPerDay === 0) return null; // no sales data — skip

      const holidayUplift = getHolidayUplift(14, item.name, 'VIC');
      const weatherUpliftForItem = getWeatherUplift(weatherForecast, item.name);
      const combinedUplift = Math.max(holidayUplift, weatherUpliftForItem);
      const adjustedVelocity = velocityPerDay * combinedUplift;

      const daysRemaining = item.currentStock / velocityPerDay;
      const adjustedDaysRemaining = item.currentStock / adjustedVelocity;

      const suggestedOrder = Math.max(0, Math.ceil(adjustedVelocity * 14 - item.currentStock));

      let urgency: 'critical' | 'high' | 'medium' | 'low';
      if (adjustedDaysRemaining <= 3) urgency = 'critical';
      else if (adjustedDaysRemaining <= 7) urgency = 'high';
      else if (adjustedDaysRemaining <= 14) urgency = 'medium';
      else urgency = 'low';

      const orderOffsetDays = urgency === 'critical' || urgency === 'high' ? 0
        : urgency === 'medium' ? 3 : 7;
      const orderDate = new Date(Date.now() + orderOffsetDays * 86400000).toISOString().split('T')[0];

      return {
        item_id: item.id,
        item_name: item.name,
        current_stock: item.currentStock,
        velocity_per_day: Math.round(velocityPerDay * 100) / 100,
        days_remaining: Math.round(daysRemaining * 10) / 10,
        adjusted_days_remaining: Math.round(adjustedDaysRemaining * 10) / 10,
        holiday_uplift: combinedUplift,
        suggested_order: suggestedOrder,
        recommended_order_date: orderDate,
        urgency,
        unit: item.unit,
      };
    })
    .filter((i): i is ForecastItem => i !== null && i.suggested_order > 0)
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.urgency] - order[b.urgency];
    });

  // Claude summary
  let aiSummary = null;
  if (forecastItems.length > 0) {
    try {
      const context = {
        business_name: business.name,
        industry: business.industry,
        items_needing_reorder: forecastItems.slice(0, 15).map(i => ({
          name: i.item_name,
          current_stock: i.current_stock,
          days_left: i.adjusted_days_remaining,
          order_qty: i.suggested_order,
          urgency: i.urgency,
          holiday_uplift: i.holiday_uplift > 1 ? `×${i.holiday_uplift}` : null,
        })),
        upcoming_holidays: upcomingHolidays.map(h => `${h.name} in ${h.days_away} days`),
      };

      const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const msg = 
await trackAICall({ route: 'aria/reorder-forecast', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'reorder-summary' }, () => anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 600,
      temperature: 0.4,
        system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
        messages: [{
          role: 'user',
          content: `Reorder data: ${JSON.stringify(context)}
Return: {"summary":"2-3 sentences with specific items/quantities","urgent_items":["item names that are critical/high"],"holiday_note":"string or null","recommended_actions":[{"action":"string","by_when":"string"}]}`,
        }],
      }));
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
      aiSummary = parseLLMJsonOr(raw, {}, 'reorder-forecast');
    } catch { /* non-critical — continue without summary */ }
  }

  const forecast = {
    items: forecastItems,
    upcoming_holidays: upcomingHolidays.map(({ name, date, days_away }) => ({ name, date, days_away })),
    ai_summary: aiSummary,
    generated_at: new Date().toISOString(),
  };

  await supabaseAdmin.from('reorder_forecasts').upsert({
    business_id, date: today, forecast, generated_at: forecast.generated_at,
  }, { onConflict: 'business_id,date' });

  return NextResponse.json({ ...forecast, cached: false });
  } catch (err: unknown) {
    Sentry.captureException(err, { tags: { route: 'aria/reorder-forecast' } });
    return NextResponse.json({ data: [], status: 'error', message: 'temporarily_unavailable' }, { status: 200 });
  }
}

export const POST = withErrorCapture('aria/reorder-forecast', _POST)
