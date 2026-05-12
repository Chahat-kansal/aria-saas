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

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ media: [] });
  const { data } = await supabase.from('pos_media').select('*').eq('business_id', bid).order('created_at', { ascending: false });
  return NextResponse.json({ media: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const MAX_MB = 10;
  if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `File too large (max ${MAX_MB}MB)` }, { status: 400 });

  let url = '';
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import('@vercel/blob');
      const blob = await put(`pos-media/${bid}/${Date.now()}-${file.name}`, file, { access: 'public' });
      url = blob.url;
    } catch (e: any) {
      return NextResponse.json({ error: 'Upload failed: ' + e.message }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Storage not configured. Add BLOB_READ_WRITE_TOKEN to enable uploads.' }, { status: 503 });
  }

  const { data, error } = await supabase.from('pos_media').insert({
    business_id: bid, url, file_name: file.name,
    file_size: file.size, file_type: file.type,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { data: item } = await supabase.from('pos_media').select('url').eq('id', id).eq('business_id', bid).single();
  if (item?.url && process.env.BLOB_READ_WRITE_TOKEN) {
    try { const { del } = await import('@vercel/blob'); await del(item.url); } catch { /* ignore */ }
  }
  await supabase.from('pos_media').delete().eq('id', id).eq('business_id', bid);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/media', _GET)
export const POST = withErrorCapture('pos/media', _POST)
export const DELETE = withErrorCapture('pos/media', _DELETE)
