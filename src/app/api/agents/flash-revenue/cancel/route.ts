export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Verify ownership via businesses join
  const { data: intervention } = await supabaseAdmin
    .from('flash_interventions')
    .select('id,business_id,cancelled_at,businesses(user_id)')
    .eq('id', body.id)
    .maybeSingle();

  if (!intervention) return NextResponse.json({ error: 'Intervention not found' }, { status: 404 });

  const bizOwner = (intervention.businesses as unknown as { user_id: string } | null)?.user_id;
  if (bizOwner !== user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  if (intervention.cancelled_at) {
    return NextResponse.json({ error: 'Already cancelled' }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from('flash_interventions')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export const POST = withErrorCapture('agents/flash-revenue/cancel', _POST);
