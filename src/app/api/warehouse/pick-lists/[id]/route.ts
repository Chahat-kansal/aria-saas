export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase.from('warehouse_pick_lists').select('*').eq('id', params.id).single();
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ pick_list: data });
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, status, assigned_to, items } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (status) {
    updates.status = status;
    if (status === 'in_progress') updates.started_at = new Date().toISOString();
  }
  if (assigned_to !== undefined) updates.assigned_to = assigned_to;
  if (items) updates.items = items;

  const { data, error } = await supabase.from('warehouse_pick_lists').update(updates).eq('id', params.id).eq('business_id', business_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pick_list: data });
}

export const GET = withErrorCapture('warehouse/pick-lists/[id]', _GET)
export const PATCH = withErrorCapture('warehouse/pick-lists/[id]', _PATCH)
