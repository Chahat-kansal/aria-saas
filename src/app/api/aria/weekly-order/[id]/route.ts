export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: draft, error } = await supabase.from('purchase_order_drafts')
    .select('*').eq('id', params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify ownership via business
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', draft.business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ draft });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { business_id, items, notes, status } = body;

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const updates: Record<string, any> = {};
  if (items !== undefined) {
    const totalCost = items.reduce((s: number, i: any) =>
      s + ((i.manual_qty ?? i.suggested_qty) * (i.unit_cost_cents || 0)), 0);
    updates.items = items;
    updates.total_cost_cents = totalCost;
  }
  if (notes !== undefined) updates.notes = notes;
  if (status !== undefined) updates.status = status;

  const { data: draft, error } = await supabase.from('purchase_order_drafts')
    .update(updates).eq('id', params.id).eq('business_id', business_id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draft });
}
