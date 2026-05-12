export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: outcomes, error } = await supabase
    .from('aria_outcomes')
    .select('*')
    .eq('business_id', business_id)
    .order('recommended_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ outcomes: outcomes ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, recommendation_type, recommendation_detail, acted_on, outcome_value_cents, notes } = body;

  // business_id is optional for this endpoint — infer from user's active business if not provided
  let resolvedBusinessId = business_id;
  if (!resolvedBusinessId) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    resolvedBusinessId = biz?.id ?? null;
  }

  if (!resolvedBusinessId) return NextResponse.json({ error: 'No business found' }, { status: 400 });
  if (!recommendation_type) return NextResponse.json({ error: 'recommendation_type required' }, { status: 400 });

  const { data: created, error } = await supabase
    .from('aria_outcomes')
    .insert({
      business_id: resolvedBusinessId,
      recommendation_type,
      recommendation_detail: recommendation_detail ?? null,
      recommended_at: new Date().toISOString(),
      acted_on: acted_on ?? false,
      acted_on_at: acted_on ? new Date().toISOString() : null,
      outcome_value_cents: outcome_value_cents ?? null,
      notes: notes ?? null,
    })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ outcome: created }, { status: 201 });
}

export const GET = withErrorCapture('aria/outcomes', _GET)
export const POST = withErrorCapture('aria/outcomes', _POST)
