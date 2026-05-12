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
  const { data, error } = await db.from('announcements').select('*').order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ announcements: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ announcements: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const db = getAdminClient();
  const { data, error } = await db.from('announcements').insert({ ...body, created_by: user.email }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAction({ admin_email: user.email!, action: 'create_announcement', target_type: 'announcement', target_id: data.id, details: { title: body.title } });
  return NextResponse.json({ announcement: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const db = getAdminClient();
  const { data, error } = await db.from('announcements').update(body).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ announcement: data });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = getAdminClient();
  await db.from('announcements').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('admin/announcements', _GET)
export const POST = withErrorCapture('admin/announcements', _POST)
export const PATCH = withErrorCapture('admin/announcements', _PATCH)
export const DELETE = withErrorCapture('admin/announcements', _DELETE)
