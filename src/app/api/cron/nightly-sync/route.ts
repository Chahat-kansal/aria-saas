import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  // Get all Square-connected businesses
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('square_connected', true)
    .eq('is_active', true);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  let processed = 0;

  for (const biz of (businesses ?? [])) {
    try {
      const res = await fetch(`${appUrl}/api/integrations/square/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: biz.id, _cron: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        errors.push({ business_id: biz.id, error: err.error ?? 'Sync failed' });
      } else {
        // Pre-generate tomorrow's briefing so it loads instantly at 8am
        fetch(`${appUrl}/api/aria/daily-briefing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: biz.id, force_refresh: true }),
        }).catch(() => { /* non-critical */ });
      }
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
