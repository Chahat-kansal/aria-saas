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

type Params = { params: Promise<{ id: string }> }

async function _PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json();
  delete (body as any).id;
  delete (body as any).business_id;
  delete (body as any).created_at;
  body.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('pos_tables')
    .update(body)
    .eq('id', id)
    .eq('business_id', bid)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, table: data });
}

async function _DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { error } = await supabase.from('pos_tables').delete().eq('id', id).eq('business_id', bid);
  // BOOKINGS-MOCKUP-MATCH — never hard-delete a table with historical bookings (RULE0: don't
  // lose data). Postgres 23503 = foreign key violation (bookings.table_id references this row).
  if (error) {
    if (error.code === '23503') {
      return NextResponse.json({ error: 'This table has booking history — archive it instead of deleting.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true });
}

export const PATCH  = withErrorCapture('pos/tables/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/tables/[id]', _DELETE)
