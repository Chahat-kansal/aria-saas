export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

async function verifyOwnership(supabase: SupabaseClient, userId: string, businessId: string) {
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('user_id', userId)
    .single();
  return biz ?? null;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await supabase
    .from('warehouse_production_orders')
    .select('*')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ orders: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    business_id: string;
    bom_id: string;
    finished_item_id?: string;
    finished_item_name: string;
    quantity_planned: number;
    planned_start?: string;
    planned_end?: string;
    notes?: string;
  };

  const { business_id, bom_id, finished_item_id, finished_item_name, quantity_planned, planned_start, planned_end, notes } = body;
  if (!business_id || !bom_id || !finished_item_name || !quantity_planned) {
    return NextResponse.json({ error: 'business_id, bom_id, finished_item_name, quantity_planned required' }, { status: 400 });
  }

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const today = new Date().toISOString().split('T')[0];
  const { count } = await supabase
    .from('warehouse_production_orders')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', business_id);
  const order_number = `PRD-${today}-${((count ?? 0) + 1).toString().padStart(3, '0')}`;

  const { data, error } = await supabase
    .from('warehouse_production_orders')
    .insert({
      business_id,
      bom_id,
      finished_item_id: finished_item_id ?? null,
      finished_item_name,
      quantity_planned,
      quantity_produced: 0,
      planned_start: planned_start ?? null,
      planned_end: planned_end ?? null,
      notes: notes ?? null,
      status: 'draft',
      order_number,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data }, { status: 201 });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json() as {
    business_id: string;
    status?: string;
    quantity_produced?: number;
    actual_start?: string;
    actual_end?: string;
    notes?: string;
  };

  const { business_id, status } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.quantity_produced !== undefined) updates.quantity_produced = body.quantity_produced;
  if (body.actual_start !== undefined) updates.actual_start = body.actual_start;
  if (body.actual_end !== undefined) updates.actual_end = body.actual_end;
  if (body.notes !== undefined) updates.notes = body.notes;

  if (status === 'completed') {
    const { data: order } = await supabase
      .from('warehouse_production_orders')
      .select('*, warehouse_bom(warehouse_bom_components(*))')
      .eq('id', id)
      .eq('business_id', business_id)
      .single();

    if (order) {
      const qty_produced: number = body.quantity_produced ?? (order.quantity_planned as number);
      const bom = order.warehouse_bom as { warehouse_bom_components: Array<{ component_item_id: string | null; quantity_required: number }> } | null;
      const components = bom?.warehouse_bom_components ?? [];

      for (const comp of components) {
        if (!comp.component_item_id) continue;
        try {
          const { data: prod } = await supabase
            .from('pos_products')
            .select('id, stock_quantity')
            .eq('id', comp.component_item_id)
            .eq('business_id', business_id)
            .single();
          if (prod) {
            const newQty = Math.max(0, (prod.stock_quantity as number) - comp.quantity_required * qty_produced);
            await supabase.from('pos_products').update({ stock_quantity: newQty }).eq('id', prod.id);
          }
        } catch {
          // non-fatal
        }
      }

      if (order.finished_item_id) {
        try {
          const { data: finProd } = await supabase
            .from('pos_products')
            .select('id, stock_quantity')
            .eq('id', order.finished_item_id as string)
            .eq('business_id', business_id)
            .single();
          if (finProd) {
            const newQty = (finProd.stock_quantity as number) + qty_produced;
            await supabase.from('pos_products').update({ stock_quantity: newQty }).eq('id', finProd.id);
          }
        } catch {
          // non-fatal
        }
      }

      try {
        await supabase.from('stock_movements').insert({
          business_id,
          reference_type: 'production',
          reference_id: id,
          notes: `Assembly order ${order.order_number as string} completed`,
        });
      } catch {
        // non-fatal
      }
    }
  }

  const { data, error } = await supabase
    .from('warehouse_production_orders')
    .update(updates)
    .eq('id', id)
    .eq('business_id', business_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}
