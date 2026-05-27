export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface BulkRow { date: string; time: string; platform: string; caption: string; image_url?: string }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { rows } = await req.json() as { rows: BulkRow[] };
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: 'rows required' }, { status: 400 });

  const inserts = rows.filter(r => r.date && r.caption && r.platform).map(r => {
    const scheduled_at = new Date(`${r.date}T${r.time || '09:00'}:00`).toISOString();
    return {
      business_id: bid,
      platform: r.platform.toLowerCase(),
      caption: r.caption,
      image_url: r.image_url || null,
      scheduled_at,
      status: 'scheduled',
    };
  });
  if (inserts.length === 0) return NextResponse.json({ scheduled: 0, error: 'no valid rows' });

  const { error, count } = await supabase.from('social_posts').insert(inserts, { count: 'exact' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const platforms = Array.from(new Set(inserts.map(i => i.platform)));
  return NextResponse.json({ scheduled: count ?? inserts.length, platforms });
}

export const POST = withErrorCapture('social/bulk-schedule', _POST);
