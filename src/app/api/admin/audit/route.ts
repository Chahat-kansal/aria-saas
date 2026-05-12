export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAdminClient, isAdminEmail } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page   = parseInt(searchParams.get('page')  || '1');
  const limit  = parseInt(searchParams.get('limit') || '50');
  const admin  = searchParams.get('admin');
  const action = searchParams.get('action');
  const offset = (page - 1) * limit;

  const db = getAdminClient();
  let query = db.from('admin_audit_log').select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (admin)  query = query.eq('admin_email', admin);
  if (action) query = query.eq('action', action);

  const { data, count, error } = await query;
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ entries: [], total: 0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entries: data ?? [], total: count ?? 0, page, limit });
}

export const GET = withErrorCapture('admin/audit', _GET)
