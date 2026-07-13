export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getBid } from '@/lib/auth/get-bid'

// H-17 — POST/PATCH used to spread the whole request body directly into the DB write, so a
// client could set any column verbatim. Explicit allowlist matching pos_categories' real columns
// (confirmed live via information_schema — id/business_id/created_at are never client-settable).
const CATEGORY_FIELDS = ['name', 'color', 'is_active', 'sort_order', 'ordering_archetype'] as const
function pickCategoryFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of CATEGORY_FIELDS) if (f in body) out[f] = body[f]
  return out
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json();
  const { data: category, error } = await supabase
    .from('pos_categories')
    .insert({ ...pickCategoryFields(body), business_id: bid })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const { error } = await supabase
    .from('pos_categories')
    .update(pickCategoryFields(body))
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('pos_categories')
    .delete()
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ categories: [] })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ categories: [] })
  const { data } = await supabase.from('pos_categories').select('id, name, color').eq('business_id', bid).order('name')
  return NextResponse.json({ categories: data ?? [] })
}

export const GET = withErrorCapture('pos/categories', _GET)
export const POST = withErrorCapture('pos/categories', _POST)
export const PATCH = withErrorCapture('pos/categories', _PATCH)
export const DELETE = withErrorCapture('pos/categories', _DELETE)
