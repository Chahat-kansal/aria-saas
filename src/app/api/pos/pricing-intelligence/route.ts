export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

interface SaleRow { total_amount: number | null; created_at: string; status: string | null }

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ suggestions: [], hourly: [] });

  const since = new Date(Date.now() - 28 * 86400_000).toISOString();
  const { data } = await supabase.from('pos_sales')
    .select('total_amount, created_at, status')
    .eq('business_id', bid).neq('status', 'voided').gte('created_at', since).limit(20000);

  const rows = (data ?? []) as SaleRow[];
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, count: 0 }));
  for (const s of rows) {
    const h = new Date(s.created_at).getHours();
    hourly[h].revenue += Math.max(0, Number(s.total_amount ?? 0));
    hourly[h].count++;
  }

  // Quiet windows: trading hours (8-22) with revenue < 30% of peak
  const tradingHours = hourly.filter(h => h.hour >= 8 && h.hour <= 22 && h.count > 0);
  if (tradingHours.length === 0) return NextResponse.json({ suggestions: [], hourly });
  const peakRev = Math.max(...tradingHours.map(h => h.revenue));

  // Find contiguous quiet windows of >=2 hours
  const quiet = tradingHours.map(h => ({ ...h, quiet: peakRev > 0 && h.revenue < peakRev * 0.3 }));
  const suggestions: Array<{ start_hour: number; end_hour: number; avg_revenue: number; message: string }> = [];
  let runStart: number | null = null;
  for (let i = 0; i < quiet.length; i++) {
    if (quiet[i].quiet) { if (runStart === null) runStart = quiet[i].hour }
    else {
      if (runStart !== null && quiet[i].hour - runStart >= 2) {
        const window = hourly.filter(h => h.hour >= (runStart as number) && h.hour < quiet[i].hour)
        const avg = window.reduce((a, h) => a + h.revenue, 0) / Math.max(1, window.length)
        suggestions.push({ start_hour: runStart as number, end_hour: quiet[i].hour, avg_revenue: Math.round(avg * 100) / 100, message: `${runStart}-${quiet[i].hour}:00 is your quietest window. A happy-hour discount could lift revenue.` })
      }
      runStart = null
    }
  }

  return NextResponse.json({ suggestions, hourly });
}

export const GET = withErrorCapture('pos/pricing-intelligence', _GET);
