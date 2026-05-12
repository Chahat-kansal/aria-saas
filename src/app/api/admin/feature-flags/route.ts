export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAdminClient, logAdminAction, isAdminEmail } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = getAdminClient();
  const { data: flags, error } = await db.from('feature_flags').select('*').order('flag_key');
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ flags: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ flags: flags ?? [] });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const flag_key = searchParams.get('flag_key');
  if (!flag_key) return NextResponse.json({ error: 'flag_key required' }, { status: 400 });

  const body = await req.json();
  const db = getAdminClient();
  const { data, error } = await db.from('feature_flags')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('flag_key', flag_key)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAction({ admin_email: user.email!, action: 'change_feature_flag', target_type: 'feature_flag', target_id: flag_key, details: body });
  return NextResponse.json({ flag: data });
}

export const GET = withErrorCapture('admin/feature-flags', _GET)
export const PATCH = withErrorCapture('admin/feature-flags', _PATCH)
