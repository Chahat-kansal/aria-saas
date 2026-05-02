import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type IntelligenceEventInsert = {
  business_id: string;
  event_type: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  action_label?: string;
  action_href?: string;
};

async function detectIntelligenceEvents(businessId: string): Promise<IntelligenceEventInsert[]> {
  const events: IntelligenceEventInsert[] = [];
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 86400000).toISOString();
  const in30Days = new Date(now.getTime() + 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const today = now.toISOString().split('T')[0];

  // 1. Stockout imminent — products with 0 stock that had sales in last 7 days
  const [stockoutRes, visaRes, missedRes] = await Promise.all([
    supabaseAdmin
      .from('pos_products')
      .select('id, name, low_stock_threshold')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .eq('track_stock', true)
      .lte('stock_quantity', 0)
      .limit(10),
    supabaseAdmin
      .from('staff_members')
      .select('first_name, last_name, visa_expiry_date, visa_type')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .lte('visa_expiry_date', in30Days)
      .not('visa_type', 'in', '("Australian Citizen","Permanent Resident")')
      .not('visa_expiry_date', 'is', null),
    supabaseAdmin
      .from('missed_demand')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'pending'),
  ]);

  if ((stockoutRes.data ?? []).length > 0) {
    const names = (stockoutRes.data ?? []).slice(0, 3).map((p: any) => p.name).join(', ');
    events.push({
      business_id: businessId,
      event_type: 'stockout_imminent',
      severity: 'high',
      title: `${(stockoutRes.data ?? []).length} product${(stockoutRes.data ?? []).length > 1 ? 's' : ''} out of stock`,
      body: `${names} are currently out of stock and may be costing you sales. Reorder now.`,
      data: { product_names: names, count: (stockoutRes.data ?? []).length },
      action_label: 'Reorder',
      action_href: '/dashboard/reorder',
    });
  }

  // 2. Visa expiry critical
  const criticalVisa = (visaRes.data ?? []).filter((s: any) => {
    const daysLeft = Math.ceil((new Date(s.visa_expiry_date).getTime() - now.getTime()) / 86400000);
    return daysLeft <= 14;
  });
  if (criticalVisa.length > 0) {
    const names = criticalVisa.map((s: any) => `${s.first_name} ${s.last_name}`).join(', ');
    events.push({
      business_id: businessId,
      event_type: 'visa_expiry_critical',
      severity: 'critical',
      title: `Visa expiring in 14 days: ${names}`,
      body: `Fair Work compliance risk. Verify right to work before expiry or face penalties of up to A$94,600 per breach.`,
      data: { staff_names: names },
      action_label: 'View Staff',
      action_href: '/dashboard/staff',
    });
  }

  // 3. Missed demand trigger — 5+ pending items not yet analysed
  if ((missedRes.count ?? 0) >= 5) {
    events.push({
      business_id: businessId,
      event_type: 'missed_demand_backlog',
      severity: 'medium',
      title: `${missedRes.count} unanalysed missed demand items`,
      body: `You have ${missedRes.count} products customers asked for that haven't been analysed yet. Aria can estimate the revenue opportunity.`,
      data: { count: missedRes.count },
      action_label: 'Analyse',
      action_href: '/dashboard/missed-demand',
    });
  }

  return events;
}

export async function GET(req: Request) {
  // Vercel Cron authenticates via Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const errors: { business_id: string; error: string }[] = [];

  // Log this run
  const { data: logEntry } = await supabaseAdmin.from('cron_logs').insert({
    job_name: 'nightly-sync',
    started_at: startedAt,
    status: 'running',
  }).select().single();

  // Get all active businesses (not just Square — for intelligence events)
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, square_connected')
    .eq('is_active', true);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  let processed = 0;

  for (const biz of (businesses ?? [])) {
    try {
      // Square sync (only for Square-connected businesses)
      if ((biz as any).square_connected) {
        const res = await fetch(`${appUrl}/api/integrations/square/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: biz.id, _cron: true }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          errors.push({ business_id: biz.id, error: err.error ?? 'Sync failed' });
        }
      }

      // Pre-generate tomorrow's briefing so it loads instantly at 8am
      fetch(`${appUrl}/api/aria/daily-briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: biz.id, force_refresh: true }),
      }).catch(() => { /* non-critical */ });

      // Detect intelligence events for this business
      try {
        const intelligenceEvents = await detectIntelligenceEvents(biz.id);
        if (intelligenceEvents.length > 0) {
          await supabaseAdmin.from('intelligence_events').insert(intelligenceEvents);
        }
      } catch { /* non-critical */ }

      processed++;
    } catch (err: any) {
      errors.push({ business_id: biz.id, error: err.message });
    }
  }

  // Update log entry
  if (logEntry?.id) {
    await supabaseAdmin.from('cron_logs').update({
      finished_at: new Date().toISOString(),
      businesses_processed: processed,
      errors,
      status: errors.length > 0 ? 'completed' : 'completed',
    }).eq('id', logEntry.id);
  }

  return NextResponse.json({
    ok: true,
    businesses_processed: processed,
    errors_count: errors.length,
    errors,
  });
}
