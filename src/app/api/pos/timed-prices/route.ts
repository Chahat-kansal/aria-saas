export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

function nowLocal(): { dow: number; hhmm: string } {
  const s = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', hour12: false, hour: '2-digit', minute: '2-digit' });
  const m = s.match(/^(\w+),?\s*(\d{2}):(\d{2})/);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  if (!m) return { dow: new Date().getDay(), hhmm: new Date().toISOString().slice(11, 16) };
  return { dow: dowMap[m[1]] ?? 0, hhmm: m[2] + ':' + m[3] };
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ schedules: [] });
  const { data } = await supabase.from('scheduled_price_changes')
    .select('id, business_id, product_id, category_id, product_name, original_price, timed_price, discount_pct, days_of_week, start_time, end_time, label, is_active')
    .eq('business_id', bid).order('created_at', { ascending: false });
  const { dow, hhmm } = nowLocal();
  const schedules = (data ?? []).map(s => {
    const inDay = Array.isArray(s.days_of_week) && s.days_of_week.includes(dow);
    const start = String(s.start_time ?? '').slice(0, 5);
    const end = String(s.end_time ?? '').slice(0, 5);
    const is_active_now = Boolean(s.is_active) && inDay && hhmm >= start && hhmm <= end;
    return { ...s, is_active_now };
  });
  return NextResponse.json({ schedules });
}

async function _POST(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json();

  if (!Array.isArray(body.days_of_week) || !body.start_time || !body.end_time) {
    return NextResponse.json({ error: 'days_of_week, start_time, end_time required' }, { status: 400 });
  }
  if (!body.product_id && !body.category_id) {
    return NextResponse.json({ error: 'product_id or category_id required' }, { status: 400 });
  }

  let timedPrice = body.timed_price != null ? Number(body.timed_price) : null;
  let originalPrice: number | null = null;
  let productName: string | null = body.label ?? null;

  if (body.product_id) {
    const { data: prod } = await supabase.from('pos_products').select('name, price').eq('id', body.product_id).eq('business_id', bid).maybeSingle();
    if (!prod) return NextResponse.json({ error: 'product not found' }, { status: 404 });
    originalPrice = Number(prod.price);
    productName = productName ?? String(prod.name);
    if (timedPrice == null && body.discount_pct != null) {
      timedPrice = +(originalPrice * (1 - Number(body.discount_pct) / 100)).toFixed(2);
    }
  }

  const { data, error } = await supabase.from('scheduled_price_changes').insert({
    business_id: bid,
    product_id: body.product_id ?? null,
    category_id: body.category_id ?? null,
    product_name: productName,
    original_price: originalPrice,
    timed_price: timedPrice,
    discount_pct: body.discount_pct != null ? Number(body.discount_pct) : null,
    days_of_week: body.days_of_week,
    start_time: body.start_time,
    end_time: body.end_time,
    label: body.label ?? null,
    is_active: true,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data });
}

async function _PATCH(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const k of ['timed_price', 'discount_pct', 'days_of_week', 'start_time', 'end_time', 'label', 'is_active', 'category_id']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  const { error } = await supabase.from('scheduled_price_changes').update(patch).eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await supabase.from('scheduled_price_changes').delete().eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/timed-prices', _GET);
export const POST = withBusinessContext('pos/timed-prices', _POST);
export const PATCH = withBusinessContext('pos/timed-prices', _PATCH);
export const DELETE = withBusinessContext('pos/timed-prices', _DELETE);
