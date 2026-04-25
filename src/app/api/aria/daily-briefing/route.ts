import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { business_id, industry } = await req.json();
    if (!business_id) {
      return NextResponse.json({ error: 'business_id required' }, { status: 400 });
    }

    // Verify ownership
    const { data: business } = await supabase
      .from('businesses')
      .select('id, name, owner_name, industry, city, monthly_revenue, staff_count, biggest_challenge')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single();

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const today = new Date().toISOString().split('T')[0];
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    // Check cache
    const { data: cached } = await supabase
      .from('daily_briefings')
      .select('*')
      .eq('business_id', business_id)
      .eq('date', today)
      .single();

    if (cached && cached.generated_at > sixHoursAgo && !cached.dismissed_at) {
      return NextResponse.json({ recommendations: cached.recommendations, cached: true });
    }

    // Run all data queries in parallel
    const [
      lapsedResult,
      reviewsResult,
      stockResult,
      winbackResult,
      competitorResult,
      revenueResult,
      slowDayResult,
    ] = await Promise.all([
      supabase.rpc('exec_sql', {}).then(() => null).catch(() => null), // placeholder — use direct query below
      supabase.rpc('exec_sql', {}).then(() => null).catch(() => null),
      supabase.rpc('exec_sql', {}).then(() => null).catch(() => null),
      supabase.rpc('exec_sql', {}).then(() => null).catch(() => null),
      supabase.rpc('exec_sql', {}).then(() => null).catch(() => null),
      supabase.rpc('exec_sql', {}).then(() => null).catch(() => null),
      supabase.rpc('exec_sql', {}).then(() => null).catch(() => null),
    ]);

    // Direct parallel queries (the rpc stubs above are discarded)
    const [
      { count: lapsedCount },
      { count: unansweredReviews },
      { count: lowStockCount },
      { count: winbackCount },
      { count: unreadAlerts },
      { data: weeklyRevenue },
      { data: dailyRevenue },
    ] = await Promise.all([
      supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', business_id)
        .lt('last_visit', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
        .neq('churn_risk', 'churned'),

      supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', business_id)
        .is('response', null)
        .gt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

      supabase
        .from('pos_products')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', business_id)
        .gt('reorder_point', 0)
        .lte('stock_quantity', 0), // fallback: stock at/below 0

      supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', business_id)
        .eq('type', 'winback')
        .gt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

      supabase
        .from('competitor_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', business_id)
        .eq('read', false),

      supabase
        .from('pos_sales')
        .select('created_at, total')
        .eq('business_id', business_id)
        .gt('created_at', new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true }),

      supabase
        .from('pos_sales')
        .select('created_at, total')
        .eq('business_id', business_id)
        .gt('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    // Compute revenue trend
    let revenueTrend = 'insufficient data';
    let slowDayWarning = '';
    if (weeklyRevenue && weeklyRevenue.length >= 4) {
      const totals = weeklyRevenue.map((r: { total: number }) => r.total || 0);
      const recent = totals.slice(-2).reduce((a: number, b: number) => a + b, 0) / 2;
      const earlier = totals.slice(0, 4).reduce((a: number, b: number) => a + b, 0) / 4;
      const pct = earlier > 0 ? Math.round(((recent - earlier) / earlier) * 100) : 0;
      revenueTrend = `${pct > 0 ? '+' : ''}${pct}% vs prior 4-week average`;
    }

    const todayDow = new Date().getDay();
    if (dailyRevenue && dailyRevenue.length > 0) {
      const byDow: Record<number, number[]> = {};
      for (const row of dailyRevenue as { created_at: string; total: number }[]) {
        const dow = new Date(row.created_at).getDay();
        if (!byDow[dow]) byDow[dow] = [];
        byDow[dow].push(row.total || 0);
      }
      const allTotals = (dailyRevenue as { total: number }[]).map(r => r.total || 0);
      const overallAvg = allTotals.reduce((a, b) => a + b, 0) / allTotals.length;
      const todayAvg = byDow[todayDow]
        ? byDow[todayDow].reduce((a, b) => a + b, 0) / byDow[todayDow].length
        : overallAvg;
      if (todayAvg < overallAvg * 0.8) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        slowDayWarning = `${days[todayDow]} is historically ${Math.round((1 - todayAvg / overallAvg) * 100)}% below your daily average`;
      }
    }

    const context = {
      business: {
        name: business.name,
        industry: industry || business.industry,
        city: business.city,
        monthly_revenue: business.monthly_revenue,
        staff: business.staff_count,
        biggest_challenge: business.biggest_challenge,
      },
      metrics: {
        lapsed_customers: lapsedCount ?? 0,
        unanswered_reviews: unansweredReviews ?? 0,
        low_stock_items: lowStockCount ?? 0,
        winback_campaigns_this_month: winbackCount ?? 0,
        no_winback_campaign: (winbackCount ?? 0) === 0,
        unread_competitor_alerts: unreadAlerts ?? 0,
        revenue_trend_8_weeks: revenueTrend,
        slow_day_warning: slowDayWarning || null,
      },
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey });

    const prompt = `Business data for ${business.name} (${context.business.industry} in ${context.business.city || 'Australia'}):

Metrics today:
- Lapsed customers (60+ days no visit): ${context.metrics.lapsed_customers}
- Unanswered reviews (last 30 days): ${context.metrics.unanswered_reviews}
- Low stock items: ${context.metrics.low_stock_items}
- Winback campaigns this month: ${context.metrics.winback_campaigns_this_month}${context.metrics.no_winback_campaign ? ' (NONE — flag this)' : ''}
- Unread competitor alerts: ${context.metrics.unread_competitor_alerts}
- Revenue trend (8-week): ${context.metrics.revenue_trend_8_weeks}
${context.metrics.slow_day_warning ? `- Slow day alert: ${context.metrics.slow_day_warning}` : ''}
- Owner's biggest challenge: ${context.business.biggest_challenge || 'not specified'}

Generate 4-6 specific, actionable recommendations for today. Each must reference the actual numbers above. Return ONLY a JSON array — no markdown, no preamble:
[{ "id": "string", "priority": "high"|"medium"|"low", "category": "customers"|"revenue"|"stock"|"reviews"|"marketing"|"compliance", "title": "max 8 words", "description": "max 25 words, cite actual numbers", "action_label": "max 4 words", "action_type": "winback"|"review_reply"|"promotion"|"reorder"|"campaign"|"navigate"|"dismiss", "action_payload": {} }]`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: 'You are Aria, an AI business advisor. Return only valid JSON arrays. No markdown, no prose.',
      messages: [{ role: 'user', content: prompt }],
    });

    let recommendations: unknown[] = [];
    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    try {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      recommendations = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      recommendations = [];
    }

    // Upsert into daily_briefings
    await supabase
      .from('daily_briefings')
      .upsert(
        {
          business_id,
          date: today,
          recommendations,
          generated_at: new Date().toISOString(),
          dismissed_at: null,
        },
        { onConflict: 'business_id,date' }
      );

    return NextResponse.json({ recommendations, cached: false });
  } catch (err) {
    console.error('Daily briefing error:', err);
    return NextResponse.json({ error: 'Failed to generate briefing' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { business_id } = await req.json();
    const today = new Date().toISOString().split('T')[0];

    // Verify ownership
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single();

    if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await supabase
      .from('daily_briefings')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('business_id', business_id)
      .eq('date', today);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}