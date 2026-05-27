export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: row } = await supabaseAdmin.from('business_features').select('upvotes').eq('id', id).maybeSingle();
  const next = (Number(row?.upvotes ?? 0) + 1);
  await supabaseAdmin.from('business_features').update({ upvotes: next }).eq('id', id);

  return NextResponse.json({ ok: true, upvotes: next });
}

export const POST = withErrorCapture('business-features/upvote', _POST);
