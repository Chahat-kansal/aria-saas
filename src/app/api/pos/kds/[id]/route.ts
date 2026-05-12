export const dynamic = 'force-dynamic';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

type KdsStatus = 'new' | 'in_progress' | 'ready' | 'delivered' | 'void';

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { status }: { status: KdsStatus } = await req.json();
  if (!status) return NextResponse.json({ error: 'status required' }, { status: 400 });

  const validStatuses: KdsStatus[] = ['new', 'in_progress', 'ready', 'delivered', 'void'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status };
  if (status === 'delivered') {
    updates.bumped_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('pos_kds_orders')
    .update(updates)
    .eq('id', params.id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorCapture('pos/kds/[id]', _PATCH)
