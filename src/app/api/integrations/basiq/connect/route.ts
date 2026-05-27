export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { createUser, createAuthLink, isConfigured } from '@/lib/integrations/basiq';

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isConfigured()) return NextResponse.json({ error: 'BASIQ_API_KEY not configured' }, { status: 500 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses')
    .select('id, basiq_user_id, email').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let basiqUserId = (biz.basiq_user_id as string | null) ?? null;
  if (!basiqUserId) {
    const email = (biz.email as string | null) ?? user.email;
    if (!email) return NextResponse.json({ error: 'Business email required to connect bank' }, { status: 400 });
    const created = await createUser(email);
    basiqUserId = created.id;
    await supabaseAdmin.from('businesses').update({ basiq_user_id: basiqUserId }).eq('id', business_id);
  }

  const link = await createAuthLink(basiqUserId);
  return NextResponse.json({ consent_url: link.url, basiq_user_id: basiqUserId, expires_at: link.expiresAt ?? null });
}

export const POST = withErrorCapture('integrations/basiq/connect', _POST);
