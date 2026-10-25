export const dynamic = 'force-dynamic';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getRevenueSnapshot } from '@/lib/aria/revenue-snapshot'
import { todayAEST } from '@/lib/date-au'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ tables: [] });

  const { data, error } = await supabase
    .from('pos_tables')
    .select('*')
    .eq('business_id', bid)
    .is('archived_at', null)
    .order('section', { nullsFirst: true })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // VENUE-VIEW-1 — ?venue=1 ADDS two things and changes nothing else. Without the param this route
  // returns byte-identical output to before, so every existing caller (FloorPlan.tsx, the layout
  // editor) is untouched. Additive-only: no field removed, renamed, or re-typed.
  const wantsVenue = new URL(req.url).searchParams.get('venue') === '1';
  if (!wantsVenue) return NextResponse.json({ tables: rows });

  type Row = Record<string, unknown>;
  const venueRows: Row[] = rows as Row[];

  // 1. sale_total per row — the OPEN tab on that table, not revenue. One `in` query, never N+1.
  //    A voided sale is not a tab, so it reports null rather than its negative total.
  const openIds = Array.from(new Set(
    venueRows.map(r => r.current_sale_id).filter((v): v is string => typeof v === 'string' && v.length > 0),
  ));
  const totalById = new Map<string, number | null>();
  if (openIds.length > 0) {
    const { data: sales, error: salesErr } = await supabase
      .from('pos_sales')
      .select('id, total_amount, status')
      .eq('business_id', bid)
      .in('id', openIds);
    // RULE 7 — the error is checked, not discarded. An unreadable tab reports unknown (null), which
    // is what the card renders as "—". It never reports $0.00, which would be a claim.
    if (salesErr) return NextResponse.json({ error: salesErr.message }, { status: 500 });
    for (const s of sales ?? []) {
      totalById.set(s.id as string, s.status === 'voided' ? null : Number(s.total_amount ?? 0));
    }
  }

  const withTotals = venueRows.map(r => ({
    ...r,
    sale_total: typeof r.current_sale_id === 'string' ? totalById.get(r.current_sale_id) ?? null : null,
  }));

  // 2. summary — today's completed money comes from the ONE canonical AEST-day computation
  //    (RULE 6: never re-query pos_sales for a day-boundary revenue figure). `bid` is derived from
  //    the session above, so the business scope is still the caller's own.
  const snap = await getRevenueSnapshot(bid, todayAEST());

  // `open_tables` is counted from the rows already in hand — no second query, and it cannot
  // disagree with what the view is drawing.
  const BUSY = new Set(['occupied', 'reserved', 'seated', 'ordering', 'eating', 'check']);
  const openTables = venueRows.filter(r => BUSY.has(String(r.status ?? '').toLowerCase())).length;

  // `last_completed_at` has no canonical helper, so it is read here on the SAME session client as
  // the table read above — the RLS path is unchanged. Noted as a seam: it is the one summary figure
  // not sourced through getRevenueSnapshot, so a future divergence in pos_sales policy would show
  // up here first.
  const { data: lastSale, error: lastErr } = await supabase
    .from('pos_sales')
    .select('created_at')
    .eq('business_id', bid)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) return NextResponse.json({ error: lastErr.message }, { status: 500 });

  return NextResponse.json({
    tables: withTotals,
    summary: {
      today_completed_total: snap.revenue,
      today_completed_count: snap.transaction_count,
      open_tables: openTables,
      last_completed_at: lastSale?.created_at ?? null,
    },
  });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json();
  const { name, section, seats, shape, pos_x, pos_y,
          // legacy field aliases
          table_number, zone, x_position, y_position,
          // BOOKINGS-MOCKUP-MATCH layout-editor fields
          width, height, rotation, element_type, seating_area, display_name, is_guest_selectable } = body;
  const resolvedName = name ?? table_number;
  if (!resolvedName) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { data, error } = await supabase
    .from('pos_tables')
    .insert({
      name: resolvedName,
      table_number: resolvedName,
      section: section ?? zone ?? null,
      zone: zone ?? section ?? null,
      seats: seats ?? 2,
      shape: shape ?? 'square',
      pos_x: pos_x ?? x_position ?? 0,
      pos_y: pos_y ?? y_position ?? 0,
      width: width ?? 72,
      height: height ?? 72,
      rotation: rotation ?? 0,
      element_type: element_type ?? 'table',
      seating_area: seating_area ?? null,
      display_name: display_name ?? null,
      is_guest_selectable: is_guest_selectable ?? false,
      status: 'available',
      business_id: bid,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ table: data });
}

export const GET = withErrorCapture('pos/tables', _GET)
export const POST = withErrorCapture('pos/tables', _POST)
