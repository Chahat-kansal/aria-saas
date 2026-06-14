export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface Schedule { id: string; business_id: string; product_id: string; original_price: number | null; timed_price: number | null; days_of_week: number[] | null; start_time: string | null; end_time: string | null; is_active: boolean | null }

function nowInAEST(): { dow: number; hhmm: string } {
  const aestStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', hour12: false, hour: '2-digit', minute: '2-digit' });
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // aestStr like "Mon, 14:30"
  const m = aestStr.match(/^(\w+),?\s*(\d{2}):(\d{2})/);
  if (!m) return { dow: new Date().getDay(), hhmm: new Date().toISOString().slice(11, 16) };
  return { dow: dowMap[m[1]] ?? 0, hhmm: `${m[2]}:${m[3]}` };
}

async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied
  const { dow, hhmm } = nowInAEST();
  const { data: schedules } = await supabaseAdmin.from('scheduled_price_changes')
    .select('id, business_id, product_id, original_price, timed_price, days_of_week, start_time, end_time, is_active')
    .eq('is_active', true);

  const list = (schedules ?? []) as Schedule[];
  let activated = 0, reverted = 0;

  for (const s of list) {
    if (!s.product_id || !s.start_time || !s.end_time || !s.days_of_week) continue;
    const inDay = s.days_of_week.includes(dow);
    const start = s.start_time.slice(0, 5);
    const end = s.end_time.slice(0, 5);
    const inWindow = inDay && hhmm >= start && hhmm <= end;

    const { data: prod } = await supabaseAdmin.from('pos_products').select('price').eq('id', s.product_id).maybeSingle();
    if (!prod) continue;
    const curr = Number(prod.price ?? 0);
    const timed = Number(s.timed_price ?? 0);
    const orig = Number(s.original_price ?? 0);

    if (inWindow && timed > 0 && curr !== timed) {
      await supabaseAdmin.from('pos_products').update({ price: timed }).eq('id', s.product_id);
      activated++;
    } else if (!inWindow && orig > 0 && curr === timed) {
      await supabaseAdmin.from('pos_products').update({ price: orig }).eq('id', s.product_id);
      reverted++;
    }
  }

  return NextResponse.json({ ok: true, schedules: list.length, activated, reverted, now: { dow, hhmm } });
}

export const GET = withErrorCapture('cron/timed-prices', _GET);
