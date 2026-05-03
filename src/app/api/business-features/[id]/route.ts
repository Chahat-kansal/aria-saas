export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function verifyOwner(supabase: ReturnType<typeof import('@/lib/supabase-server').createServerSupabaseClient>, featureId: string, userId: string) {
  const { data } = await supabase
    .from('business_features')
    .select('id, business_id, businesses!inner(user_id)')
    .eq('id', featureId)
    .eq('businesses.user_id', userId)
    .maybeSingle();
  return data;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const feature = await verifyOwner(supabase, params.id, user.id);
  if (!feature) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const allowed = ['name', 'description', 'config', 'is_active', 'display_order', 'location'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k];
  }

  const { data, error } = await supabase.from('business_features').update(updates).eq('id', params.id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feature: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const feature = await verifyOwner(supabase, params.id, user.id);
  if (!feature) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await supabase.from('business_features').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', params.id);
  return NextResponse.json({ ok: true });
}
