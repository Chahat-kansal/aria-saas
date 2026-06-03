export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { MenuEngineeringAgent } from '@/lib/agents/menu-engineering-agent';

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq(business_id ? 'id' : 'user_id', business_id ?? user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const { data: actions, error } = await supabaseAdmin
    .from('menu_engineering_actions')
    .select('*,pos_products(name)')
    .eq('business_id', biz.id)
    .order('executed_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ actions: actions ?? [], total: (actions ?? []).length });
}

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

  // Manual trigger — runs the agent now
  const agent = new MenuEngineeringAgent();
  const result = await agent.run(biz.id);

  return NextResponse.json({
    ok: true,
    decisions: result.decisions.length,
    duration_ms: result.duration_ms,
    errors: result.errors.map(e => e.message),
  });
}

export const GET = withErrorCapture('agents/menu-engineering/actions', _GET);
export const POST = withErrorCapture('agents/menu-engineering/actions', _POST);
