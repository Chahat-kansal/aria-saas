export const maxDuration = 300
import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { withRetry } from '@/lib/api/retry'
import { trackCron } from '@/app/api/cron/_lib/track-cron'
import { makeLazyServiceRoleClient } from '@/lib/supabase-lazy'

// Lazy (see supabase-lazy.ts) — module-scope createClient() crashes Next's
// build-time page-data collection if env vars aren't readable there.
const supabaseAdmin = makeLazyServiceRoleClient();

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

async function _GET(req: Request) {
  // Retry wrapper — 3 attempts with exponential backoff
  return withRetry(async () => {
  const denied = verifyCronAuth(req)
  if (denied) return denied

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
    .select('id, square_connected, basiq_user_id')
    .eq('is_active', true);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  let processed = 0;

  for (const biz of (businesses ?? [])) {
    try {
      // Square sync (only for Square-connected businesses)
      if ((biz as any).square_connected) {
        const res = await fetch(`${appUrl}/api/integrations/square/sync`, {
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
          body: JSON.stringify({ business_id: biz.id, _cron: true }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          errors.push({ business_id: biz.id, error: err.error ?? 'Sync failed' });
        }
      }

      // Basiq bank transaction sync (fire-and-forget, non-critical)
      if ((biz as any).basiq_user_id) {
        try {
          await fetch(`${appUrl}/api/integrations/basiq/sync-transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_id: biz.id }),
          })
          // Warm the cash-flow cache after sync
          fetch(`${appUrl}/api/pos/cash-flow/analysis?period=30d`, {
            headers: { 'x-business-id': biz.id },
          }).catch(() => { /* non-critical */ })
        } catch { /* non-critical */ }
      }

      // Pre-generate tomorrow's briefing so it loads instantly at 8am
      fetch(`${appUrl}/api/aria/daily-briefing`, {
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

      // Publish scheduled social posts that are due
      try {
        const { data: duePosts } = await supabaseAdmin
          .from('social_posts')
          .select('id, business_id')
          .eq('status', 'approved')
          .lte('scheduled_for', new Date().toISOString());
        for (const post of (duePosts ?? [])) {
          fetch(`${appUrl}/api/social/publish`, {
            body: JSON.stringify({ post_id: post.id, business_id: post.business_id }),
          }).catch(() => { /* non-critical */ });
        }
      } catch { /* non-critical */ }

      // Skip AI calls for businesses with no recent sales
      const { count: recentSalesCount } = await supabaseAdmin
        .from('pos_sales')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', biz.id)
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
      const hasSales = (recentSalesCount ?? 0) > 0

      // Generate social post suggestions (if business has connections and frequency matches)
      try {
        if (!hasSales) throw new Error('skip: no sales')
        const { data: socialPrefs } = await supabaseAdmin
          .from('social_preferences').select('post_frequency').eq('business_id', biz.id).maybeSingle();
        const { data: socialConns } = await supabaseAdmin
          .from('social_connections').select('platform').eq('business_id', biz.id).eq('is_active', true);
        if (socialConns && socialConns.length > 0 && socialPrefs?.post_frequency !== 'on_demand') {
          const { data: recentDrafts } = await supabaseAdmin
            .from('social_posts').select('id', { count: 'exact', head: true })
            .eq('business_id', biz.id).eq('status', 'draft')
            .gte('created_at', new Date(Date.now() - 86400000).toISOString());
          if (!recentDrafts) {
            fetch(`${appUrl}/api/aria/social-suggest`, {
              body: JSON.stringify({ business_id: biz.id, platforms: socialConns.map((c: any) => c.platform), count: 3 }),
            }).catch(() => { /* non-critical */ });
          }
        }
      } catch { /* non-critical */ }

      // Generate weekly order draft on Sunday nights
      try {
        if (!hasSales) throw new Error('skip: no sales')
        const dayOfWeek = new Date().getDay();
        if (dayOfWeek === 0) {
          const weekStart = new Date();
          weekStart.setDate(weekStart.getDate() + 1);
          const weekStartStr = weekStart.toISOString().split('T')[0];
          const { data: existingDraft } = await supabaseAdmin
            .from('purchase_order_drafts').select('id')
            .eq('business_id', biz.id).eq('week_starting', weekStartStr).maybeSingle();
          if (!existingDraft) {
            fetch(`${appUrl}/api/aria/weekly-order`, {
              body: JSON.stringify({ business_id: biz.id, week_starting: weekStartStr }),
            }).catch(() => { /* non-critical */ });
          }
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
  }, { attempts: 3, delayMs: 3000 })
}

async function _GETTracked(req: Request) {
  return trackCron('nightly-sync', async () => _GET(req))
}
export const GET = withErrorCapture('cron/nightly-sync', _GETTracked)
