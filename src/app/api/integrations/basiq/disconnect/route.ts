export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { deleteUser, isConfigured } from '@/lib/integrations/basiq';

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses')
    .select('id, basiq_user_id').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (biz.basiq_user_id && isConfigured()) {
    try { await deleteUser(biz.basiq_user_id as string) } catch (e) { console.error('[basiq/disconnect] basiq delete failed:', (e as Error).message) }
  }

  await supabaseAdmin.from('bank_transactions').delete().eq('business_id', business_id);
  await supabaseAdmin.from('bank_accounts').delete().eq('business_id', business_id);
  await supabaseAdmin.from('businesses').update({
    basiq_user_id: null, basiq_connected: false, basiq_connected_at: null,
  }).eq('id', business_id);

  return NextResponse.json({ ok: true });
}

export const POST = withErrorCapture('integrations/basiq/disconnect', _POST);
