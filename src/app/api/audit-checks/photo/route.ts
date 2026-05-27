export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const audit_id = formData.get('audit_id') as string | null;
  const item_id = formData.get('item_id') as string | null;
  const file = formData.get('photo') as File | null;
  if (!audit_id || !file) return NextResponse.json({ error: 'audit_id and photo required' }, { status: 400 });

  let photo_url: string | null = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import('@vercel/blob');
      const filename = `audits/${audit_id}/${Date.now()}-${file.name}`;
      const blob = await put(filename, file, { access: 'public', contentType: file.type });
      photo_url = blob.url;
    } catch (e) {
      console.error('[audit photo] blob upload failed:', (e as Error).message);
      return NextResponse.json({ error: 'upload failed' }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'BLOB_READ_WRITE_TOKEN not configured' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin.from('audit_item_photos').insert({
    audit_id, item_id, photo_url,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ photo: data });
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const audit_id = new URL(req.url).searchParams.get('audit_id');
  if (!audit_id) return NextResponse.json({ photos: [] });
  const { data } = await supabaseAdmin.from('audit_item_photos')
    .select('id, item_id, photo_url, uploaded_at').eq('audit_id', audit_id);
  return NextResponse.json({ photos: data ?? [] });
}

export const POST = withErrorCapture('audit-checks/photo', _POST);
export const GET = withErrorCapture('audit-checks/photo', _GET);
