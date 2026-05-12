export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAdminClient, logAdminAction, isAdminEmail } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const db = getAdminClient();
  let query = db.from('support_tickets').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ tickets: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tickets: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const db = getAdminClient();
  const { data, error } = await db.from('support_tickets').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ticket: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  if (body.status === 'resolved') body.resolved_at = new Date().toISOString();

  const db = getAdminClient();
  const { data, error } = await db.from('support_tickets').update(body).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAction({ admin_email: user.email!, action: 'update_ticket', target_type: 'support_ticket', target_id: id, details: { status: body.status } });
  return NextResponse.json({ ticket: data });
}

export const GET = withErrorCapture('admin/support', _GET)
export const POST = withErrorCapture('admin/support', _POST)
export const PATCH = withErrorCapture('admin/support', _PATCH)
