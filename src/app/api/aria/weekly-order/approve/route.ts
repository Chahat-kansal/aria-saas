export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { draft_id, business_id, items } = await req.json();
  if (!draft_id || !business_id) return NextResponse.json({ error: 'draft_id and business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Recalculate totals from items (with manual_qty overrides)
  const updatedItems = (items || []).map((item: any) => ({
    ...item,
    total_cost_cents: (item.manual_qty ?? item.suggested_qty) * (item.unit_cost_cents || 0),
  }));
  const totalCost = updatedItems.reduce((s: number, i: any) =>
    s + ((i.manual_qty ?? i.suggested_qty) * (i.unit_cost_cents || 0)), 0);

  const { data: draft, error } = await supabase.from('purchase_order_drafts')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      items: updatedItems,
      total_cost_cents: totalCost,
    })
    .eq('id', draft_id).eq('business_id', business_id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draft });
}
