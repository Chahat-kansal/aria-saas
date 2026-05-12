import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get('businessId');
    if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 });

    const { data: business } = await supabase
      .from('businesses')
      .select('google_rating,google_review_count')
      .eq('id', businessId)
      .eq('user_id', user.id)
      .single();

    if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    // Promise.allSettled so a single failing table query never kills the whole dashboard
    const results = await Promise.allSettled([
      supabase.from('bookings').select('value').eq('business_id', businessId).gte('date', startOfMonth),
      supabase.from('campaigns').select('id').eq('business_id', businessId).eq('type', 'winback').eq('status', 'completed').gte('created_at', startOfMonth),
      supabase.from('profit_leaks').select('monthly_loss').eq('business_id', businessId).eq('status', 'fixed'),
      supabase.from('activity_log').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(10),
      supabase.from('profit_leaks').select('*').eq('business_id', businessId).eq('status', 'detected').limit(5),
      supabase.from('competitor_alerts').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(5),
      supabase.from('customers').select('*').eq('business_id', businessId).in('churn_risk', ['medium', 'high']).limit(5),
      supabase.from('campaigns').select('type', { count: 'exact', head: true }).eq('business_id', businessId).in('status', ['scheduled', 'sent']),
    ]);

    const [
      bookingsResult,
      winbackResult,
      fixedLeaksResult,
      activityResult,
      activeLeaksResult,
      alertsResult,
      churnResult,
      campaignCountResult,
    ] = results;

    // Log any unexpected promise rejections (Supabase errors come through .error, not rejection)
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        Sentry.captureException(r.reason, { tags: { route: 'dashboard/stats', query_index: String(i) } });
      }
    });

    const bookings            = bookingsResult.status       === 'fulfilled' ? (bookingsResult.value.data        ?? []) : [];
    const winbackCampaigns    = winbackResult.status        === 'fulfilled' ? (winbackResult.value.data          ?? []) : [];
    const fixedLeaks          = fixedLeaksResult.status     === 'fulfilled' ? (fixedLeaksResult.value.data       ?? []) : [];
    const activity            = activityResult.status       === 'fulfilled' ? (activityResult.value.data         ?? []) : [];
    const activeLeaks         = activeLeaksResult.status    === 'fulfilled' ? (activeLeaksResult.value.data      ?? []) : [];
    const alerts              = alertsResult.status         === 'fulfilled' ? (alertsResult.value.data           ?? []) : [];
    const churnCustomers      = churnResult.status          === 'fulfilled' ? (churnResult.value.data            ?? []) : [];
    const activeCampaignTypes = campaignCountResult.status  === 'fulfilled' ? (campaignCountResult.value.count   ?? 0)  : 0;

    return NextResponse.json({
      revenue_this_month:  (bookings as any[]).reduce((s, b) => s + (b.value || 0), 0),
      customers_returned:  winbackCampaigns.length || 0,
      google_rating:       business.google_rating,
      google_review_count: business.google_review_count,
      money_saved:         (fixedLeaks as any[]).reduce((s, l) => s + (l.monthly_loss || 0), 0),
      activity:            activity || [],
      profit_leaks:        activeLeaks || [],
      competitor_alerts:   alerts || [],
      churn_customers:     churnCustomers || [],
      automations_running: activeCampaignTypes || 0,
    });
  } catch (err: unknown) {
    Sentry.captureException(err, { tags: { route: 'dashboard/stats' } });
    return NextResponse.json({ data: [], status: 'error', message: 'temporarily_unavailable' }, { status: 200 });
  }
}

export const GET = withErrorCapture('dashboard/stats', _GET)
