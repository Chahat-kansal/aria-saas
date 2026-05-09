export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type Params = { params: Promise<{ source: string }> };

const VALID_SOURCES = ['shopfront', 'square', 'lightspeed'] as const;

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request, { params }: Params) {
  const { source } = await params;
  const { searchParams } = new URL(req.url);
  const migrationId = searchParams.get('migration_id');

  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  if (migrationId) {
    const { data: migration } = await supabase.from('pos_migrations').select('*').eq('id', migrationId).eq('business_id', bid).maybeSingle();
    if (!migration) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ migration });
  }

  const { data: migrations } = await supabase.from('pos_migrations').select('*').eq('business_id', bid).eq('source', source).order('created_at', { ascending: false }).limit(10);
  return NextResponse.json({ migrations: migrations ?? [] });
}

export async function POST(req: Request, { params }: Params) {
  const { source } = await params;

  if (!VALID_SOURCES.includes(source as typeof VALID_SOURCES[number])) {
    return NextResponse.json({ error: `Unknown source: ${source}` }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { action, config } = await req.json() as { action: string; config?: Record<string, unknown> };

  if (action === 'connect') {
    if (source === 'square') return NextResponse.json({ url: '/pos/import' });
    if (source === 'lightspeed') return NextResponse.json({ url: 'mailto:hello@ariaos.site?subject=Lightspeed%20Migration' });
    return NextResponse.json({ ready: true, message: 'Upload CSV files to begin' });
  }

  if (action === 'preview') {
    const { data: migration } = await supabase.from('pos_migrations').insert({
      business_id: bid,
      source,
      status: 'pending',
      progress: 0,
    }).select('id').single();

    return NextResponse.json({ migration_id: migration?.id, status: 'pending', message: 'Ready for preview' });
  }

  if (action === 'import') {
    const migrationId = (config?.migration_id as string) ?? null;

    let mId = migrationId;
    if (!mId) {
      const { data: newMig } = await supabase.from('pos_migrations').insert({
        business_id: bid, source, status: 'running', started_at: new Date().toISOString(), progress: 0,
      }).select('id').single();
      mId = newMig?.id ?? null;
    } else {
      await supabase.from('pos_migrations').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', mId);
    }

    await supabase.from('pos_migrations').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      progress: 100,
      products_imported: 0,
      customers_imported: 0,
      sales_imported: 0,
    }).eq('id', mId);

    return NextResponse.json({ migration_id: mId, status: 'completed' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
