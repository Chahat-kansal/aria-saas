import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
  const { data } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).single();
  return data?.id ?? null;
}

// Columns safe to return in list (excludes sensitive fields)
const LIST_SELECT = `id, business_id, first_name, last_name, preferred_name, profile_photo_url,
  position, department, employment_type, status, start_date, end_date,
  right_to_work_verified, visa_type, visa_expiry_date, mobile, work_email, created_at`;

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const status = searchParams.get('status');
  let query = supabase.from('staff_members')
    .select(LIST_SELECT)
    .eq('business_id', business_id)
    .order('first_name');
  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error: e } = await query;
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ staff: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { business_id } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!body.first_name || !body.last_name || !body.position) {
    return NextResponse.json({ error: 'first_name, last_name, position required' }, { status: 400 });
  }

  const { data, error: e } = await supabase.from('staff_members')
    .insert({ ...body, updated_at: new Date().toISOString() })
    .select(LIST_SELECT)
    .single();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ staff: data });
}

export const GET = withErrorCapture('staff', _GET)
export const POST = withErrorCapture('staff', _POST)
