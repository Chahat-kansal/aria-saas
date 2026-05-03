export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

interface ReturnItem {
  item_id?: string;
  item_name: string;
  lot_number?: string;
  quantity: number;
  condition?: string;
  action?: string;
  credit_cents?: number;
}

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

  const type = searchParams.get('type');
  let query = supabase
    .from('warehouse_returns')
    .select('*')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false });

  if (type) query = query.eq('return_type', type);

  const { data } = await query.limit(200);
  return NextResponse.json({ returns: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    business_id: string;
    return_type: string;
    supplier_id?: string;
    supplier_name?: string;
    customer_name?: string;
    customer_contact?: string;
    reason: string;
    items: ReturnItem[];
    notes?: string;
  };

  const { business_id, return_type, supplier_id, supplier_name, customer_name, customer_contact, reason, items, notes } = body;
  if (!business_id || !return_type || !reason) {
    return NextResponse.json({ error: 'business_id, return_type, reason required' }, { status: 400 });
  }

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const today = new Date().toISOString().split('T')[0];
  const { count } = await supabase
    .from('warehouse_returns')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', business_id);
  const rma_number = `RMA-${today}-${((count ?? 0) + 1).toString().padStart(3, '0')}`;

  const safeItems: ReturnItem[] = items ?? [];
  const total_credit_cents = safeItems.reduce((sum, item) => sum + (item.credit_cents ?? 0), 0);

  const { data, error } = await supabase
    .from('warehouse_returns')
    .insert({
      business_id,
      rma_number,
      return_type,
      supplier_id: supplier_id ?? null,
      supplier_name: supplier_name ?? null,
      customer_name: customer_name ?? null,
      customer_contact: customer_contact ?? null,
      reason,
      items: safeItems,
      notes: notes ?? null,
      total_credit_cents,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rma: data }, { status: 201 });
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
    notes?: string;
  };

  const { business_id, status } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (status === 'restocked') {
    const { data: rma } = await supabase
      .from('warehouse_returns')
      .select('items')
      .eq('id', id)
      .eq('business_id', business_id)
      .single();

    if (rma) {
      const items = (rma.items as ReturnItem[]) ?? [];
      for (const item of items) {
        if (item.action !== 'restock' || !item.item_id) continue;
        try {
          const { data: prod } = await supabase
            .from('pos_products')
            .select('id, stock_quantity')
            .eq('id', item.item_id)
            .eq('business_id', business_id)
            .single();
          if (prod) {
            const newQty = (prod.stock_quantity as number) + item.quantity;
            await supabase.from('pos_products').update({ stock_quantity: newQty }).eq('id', prod.id);
          }
        } catch {
          // non-fatal
        }
      }
    }
  }

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.notes !== undefined) updates.notes = body.notes;

  const { data, error } = await supabase
    .from('warehouse_returns')
    .update(updates)
    .eq('id', id)
    .eq('business_id', business_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rma: data });
}
