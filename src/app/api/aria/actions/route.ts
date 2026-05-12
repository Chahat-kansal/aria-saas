export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const ALLOWED_PRIORITIES = new Set(['high', 'medium', 'low']);

async function ownsBusiness(supabase: ReturnType<typeof createServerSupabaseClient>, businessId: string, userId: string) {
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data);
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('business_id');
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!(await ownsBusiness(supabase, businessId, user.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('aria_actions')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actions: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const businessId = body.business_id;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!businessId || !title) return NextResponse.json({ error: 'business_id and title required' }, { status: 400 });
  if (!(await ownsBusiness(supabase, businessId, user.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const insert = {
    business_id: businessId,
    title,
    category: typeof body.category === 'string' ? body.category : null,
    priority: ALLOWED_PRIORITIES.has(body.priority) ? body.priority : 'medium',
    recommendation: typeof body.recommendation === 'string' ? body.recommendation : null,
    reason: typeof body.reason === 'string' ? body.reason : null,
    expected_impact: typeof body.expected_impact === 'string' ? body.expected_impact : null,
    confidence: typeof body.confidence === 'string' ? body.confidence : null,
    source: typeof body.source === 'string' ? body.source : 'api',
    payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
  };

  const { data, error } = await supabase
    .from('aria_actions')
    .insert(insert)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ action: data }, { status: 201 });
}

export const GET = withErrorCapture('aria/actions', _GET)
export const POST = withErrorCapture('aria/actions', _POST)
