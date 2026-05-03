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
    .from('warehouse_bom')
    .select('*, warehouse_bom_components(*)')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ boms: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    business_id: string;
    finished_item_id?: string;
    finished_item_name: string;
    notes?: string;
    components: Array<{
      component_item_id?: string;
      component_item_name: string;
      quantity_required: number;
      unit: string;
      notes?: string;
    }>;
  };

  const { business_id, finished_item_id, finished_item_name, notes, components } = body;
  if (!business_id || !finished_item_name) {
    return NextResponse.json({ error: 'business_id and finished_item_name required' }, { status: 400 });
  }

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: bomData, error: bomErr } = await supabase
    .from('warehouse_bom')
    .insert({ business_id, finished_item_id: finished_item_id ?? null, finished_item_name, notes: notes ?? null, version: 1, is_active: true })
    .select()
    .single();

  if (bomErr || !bomData) {
    return NextResponse.json({ error: bomErr?.message ?? 'Failed to create BOM' }, { status: 500 });
  }

  if (components && components.length > 0) {
    const rows = components.map(c => ({
      business_id,
      bom_id: bomData.id as string,
      component_item_id: c.component_item_id ?? null,
      component_item_name: c.component_item_name,
      quantity_required: c.quantity_required,
      unit: c.unit,
      notes: c.notes ?? null,
    }));
    const { error: compErr } = await supabase.from('warehouse_bom_components').insert(rows);
    if (compErr) {
      return NextResponse.json({ error: compErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ bom: bomData }, { status: 201 });
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
    is_active?: boolean;
    notes?: string;
    version?: number;
  };

  const { business_id } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.version !== undefined) updates.version = body.version;

  const { data, error } = await supabase
    .from('warehouse_bom')
    .update(updates)
    .eq('id', id)
    .eq('business_id', business_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bom: data });
}
