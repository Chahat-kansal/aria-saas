export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { CLVAgent } from '@/lib/agents/clv-agent';

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('id', body.business_id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!biz) return NextResponse.json({ error: 'Business not found or unauthorized' }, { status: 403 });

  const agent = new CLVAgent();
  const result = await agent.run(biz.id);

  return NextResponse.json({
    ok: true,
    decisions: result.decisions.length,
    duration_ms: result.duration_ms,
    errors: result.errors.map(e => e.message),
  });
}

export const POST = withErrorCapture('agents/clv/trigger', _POST);
