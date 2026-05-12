export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('businessId');
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 });

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .eq('user_id', user.id)
    .single();

  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: recentActivity, count: activityCount },
    { data: activeLeaks },
    { data: lapsedCustomers },
    { data: recentReviews },
  ] = await Promise.all([
    supabase.from('activity_log').select('description', { count: 'exact' }).eq('business_id', businessId).gte('created_at', sevenDaysAgo),
    supabase.from('profit_leaks').select('description,monthly_loss').eq('business_id', businessId).eq('status', 'detected'),
    supabase.from('customers').select('id', { count: 'exact' }).eq('business_id', businessId).in('churn_risk', ['medium', 'high']),
    supabase.from('reviews').select('rating,content').eq('business_id', businessId).order('created_at', { ascending: false }).limit(3),
  ]);

  const totalLeakLoss = (activeLeaks || []).reduce((s, l) => s + (l.monthly_loss || 0), 0);

  const context = `
Business: ${business.name} (${business.industry})
Owner: ${business.owner_name}
Plan: ${business.plan}
Google rating: ${business.google_rating || 'not set'}

Last 7 days: ${activityCount || 0} actions taken
Active profit leaks: ${activeLeaks?.length || 0} totalling $${totalLeakLoss}/mo recoverable
At-risk customers: ${lapsedCustomers?.length || 0}
Recent reviews: ${(recentReviews || []).map(r => `${r.rating}★`).join(', ') || 'none'}
  `.trim();

  try {
    const response = await trackAICall({ route: 'aria/briefing', model: 'claude-haiku-4-5-20251001', businessId: businessId, purpose: 'daily-briefing' }, () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Write a short, friendly morning briefing for the business owner. 2-3 sentences max. Be specific and actionable. Context:\n${context}`,
      }],
    }));

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return NextResponse.json({ briefing: text });
  } catch {
    return NextResponse.json({ briefing: `Good morning! Aria is running ${activityCount || 0} automations for ${business.name}. Check your dashboard for the latest updates.` });
  }
}

export const GET = withErrorCapture('aria/briefing', _GET)
