export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/external-apis';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ skipped: true, reason: 'RESEND_API_KEY not configured' });
  }

  const body = await req.json().catch(() => ({}));
  const { session_id, debrief } = body;

  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  // Get business + user email
  const { data: session } = await supabase
    .from('pos_cash_sessions')
    .select('business_id')
    .eq('id', session_id)
    .maybeSingle();

  if (!session?.business_id) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const { data: business } = await supabase
    .from('businesses')
    .select('name, owner_name')
    .eq('id', session.business_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const stats = debrief?.stats;
  const debriefText = debrief?.debrief ?? '';
  const bizName = (business as { name: string; owner_name: string | null }).name;
  const ownerName = (business as { name: string; owner_name: string | null }).owner_name?.split(' ')[0] ?? 'there';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family: -apple-system, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
    <div style="background: #0d0d14; padding: 24px 28px;">
      <p style="color: #1D9E75; font-weight: bold; font-size: 18px; margin: 0;">Aria</p>
      <p style="color: rgba(255,255,255,0.5); font-size: 12px; margin: 4px 0 0;">End of Day Report — ${bizName}</p>
    </div>
    <div style="padding: 28px;">
      <p style="color: #111; font-size: 14px; margin: 0 0 20px;">Hi ${ownerName},</p>
      ${stats ? `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
        <div style="background: #f9fafb; border-radius: 8px; padding: 14px; text-align: center;">
          <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">Revenue</p>
          <p style="color: #111; font-size: 22px; font-weight: bold; margin: 0;">A$${stats.today_revenue.toFixed(2)}</p>
        </div>
        <div style="background: #f9fafb; border-radius: 8px; padding: 14px; text-align: center;">
          <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">Transactions</p>
          <p style="color: #111; font-size: 22px; font-weight: bold; margin: 0;">${stats.today_count}</p>
        </div>
        <div style="background: #f9fafb; border-radius: 8px; padding: 14px; text-align: center;">
          <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">Avg Basket</p>
          <p style="color: #111; font-size: 22px; font-weight: bold; margin: 0;">A$${stats.avg_basket.toFixed(2)}</p>
        </div>
        ${stats.vs_avg_pct != null ? `
        <div style="background: ${stats.vs_avg_pct >= 0 ? '#f0fdf4' : '#fef2f2'}; border-radius: 8px; padding: 14px; text-align: center;">
          <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">vs 7-day Avg</p>
          <p style="color: ${stats.vs_avg_pct >= 0 ? '#16a34a' : '#dc2626'}; font-size: 22px; font-weight: bold; margin: 0;">${stats.vs_avg_pct >= 0 ? '+' : ''}${stats.vs_avg_pct.toFixed(0)}%</p>
        </div>` : ''}
      </div>
      ${stats.top_product ? `<p style="color: #6b7280; font-size: 13px; margin: 0 0 16px;">Top product today: <strong style="color: #111;">${stats.top_product}</strong></p>` : ''}
      ` : ''}
      ${debriefText ? `
      <div style="background: #f0fdf4; border-left: 3px solid #1D9E75; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
        <p style="color: #111; font-size: 13px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${debriefText}</p>
      </div>` : ''}
      <p style="color: #9ca3af; font-size: 11px; margin: 0; text-align: center;">Aria Business Intelligence · ${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </div>
  </div>
</body>
</html>`;

  const sent = await sendEmail({
    to: user.email ?? '',
    subject: `Aria EOD: ${bizName} — A$${stats?.today_revenue?.toFixed(2) ?? '0.00'} today`,
    html,
    from_name: 'Aria',
  });

  return NextResponse.json({ sent });
}
