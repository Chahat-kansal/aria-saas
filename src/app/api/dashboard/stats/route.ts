import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('businessId');
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 });

  // Verify ownership
  const { data: business } = await supabase
    .from('businesses')
    .select('google_rating,google_review_count')
    .eq('id', businessId)
    .eq('user_id', user.id)
    .single();

  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [
    { data: bookings },
    { data: winbackCampaigns },
    { data: fixedLeaks },
    { data: activity },
    { data: activeLeaks },
    { data: alerts },
    { data: churnCustomers },
    { count: activeCampaignTypes },
  ] = await Promise.all([
    supabase.from('bookings').select('value').eq('business_id', businessId).gte('date', startOfMonth),
    supabase.from('campaigns').select('id').eq('business_id', businessId).eq('type', 'winback').eq('status', 'completed').gte('created_at', startOfMonth),
    supabase.from('profit_leaks').select('monthly_loss').eq('business_id', businessId).eq('status', 'fixed'),
    supabase.from('activity_log').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(10),
    supabase.from('profit_leaks').select('*').eq('business_id', businessId).eq('status', 'detected').limit(5),
    supabase.from('competitor_alerts').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(5),
    supabase.from('customers').select('*').eq('business_id', businessId).in('churn_risk', ['medium', 'high']).limit(5),
    supabase.from('campaigns').select('type', { count: 'exact', head: true }).eq('business_id', businessId).in('status', ['scheduled', 'sent']),
  ]);

  return NextResponse.json({
    revenue_this_month: (bookings || []).reduce((s, b) => s + (b.value || 0), 0),
    customers_returned: winbackCampaigns?.length || 0,
    google_rating: business.google_rating,
    google_review_count: business.google_review_count,
    money_saved: (fixedLeaks || []).reduce((s, l) => s + (l.monthly_loss || 0), 0),
    activity: activity || [],
    profit_leaks: activeLeaks || [],
    competitor_alerts: alerts || [],
    churn_customers: churnCustomers || [],
    automations_running: activeCampaignTypes || 0,
  });
}
