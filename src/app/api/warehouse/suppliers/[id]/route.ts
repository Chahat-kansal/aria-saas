export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function verifySupplier(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, supplierId: string) {
  const { data } = await supabase
    .from('pos_suppliers')
    .select('id, business_id, businesses!inner(user_id)')
    .eq('id', supplierId)
    .single();
  if (!data || (data.businesses as any).user_id !== userId) return null;
  return data;
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rec = await verifySupplier(supabase, user.id, params.id);
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  delete body.id; delete body.business_id; delete body.created_at;

  const { data, error: e } = await supabase
    .from('pos_suppliers')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ supplier: data });
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rec = await verifySupplier(supabase, user.id, params.id);
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error: e } = await supabase
    .from('pos_suppliers')
    .update({ is_active: false })
    .eq('id', params.id);

  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorCapture('warehouse/suppliers/[id]', _PATCH)
export const DELETE = withErrorCapture('warehouse/suppliers/[id]', _DELETE)
