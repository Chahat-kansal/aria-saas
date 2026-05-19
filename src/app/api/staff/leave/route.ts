import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifyStaffOwnership(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  staffId: string
) {
  const { data } = await supabase
    .from('staff_members')
    .select('id, business_id, businesses!inner(user_id)')
    .eq('id', staffId)
    .single();
  if (!data || (data.businesses as any).user_id !== userId) return null;
  return data;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const { searchParams } = new URL(req.url);
  const staff_id = searchParams.get('staff_id');
  const status = searchParams.get('status');

  // Get business_id for this owner
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 });

  // Build query — join staff_members to get name
  let q = supabaseAdmin.from('staff_leave')
    .select('*, staff_members(first_name, last_name)')
    .eq('business_id', biz.id)
    .order('start_date', { ascending: false });

  if (staff_id) q = q.eq('staff_id', staff_id);
  if (status && status !== 'all') q = q.eq('status', status);

  const { data } = await q;

  // Flatten staff name into each row
  const leave = (data ?? []).map((r: Record<string, unknown>) => {
    const sm = r.staff_members as { first_name: string; last_name: string } | null;
    return { ...r, staff_name: sm ? `${sm.first_name} ${sm.last_name}` : null, staff_members: undefined };
  });

  return NextResponse.json({ leave });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { staff_id, leave_type, start_date, end_date } = body;
  if (!staff_id || !leave_type || !start_date || !end_date) {
    return NextResponse.json({ error: 'staff_id, leave_type, start_date, end_date required' }, { status: 400 });
  }

  const ownership = await verifyStaffOwnership(supabase, user.id, staff_id);
  if (!ownership) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Auto-calculate days_taken if not provided
  const days_taken = body.days_taken ?? Math.ceil(
    (new Date(end_date).getTime() - new Date(start_date).getTime()) / 86400000
  ) + 1;

  const { data, error: e } = await supabase.from('staff_leave').insert({
    ...body,
    business_id: ownership.business_id,
    days_taken,
  }).select().single();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });

  // If approved leave, update staff status
  if (body.status === 'approved') {
    const today = new Date().toISOString().split('T')[0];
    if (start_date <= today && end_date >= today) {
      await supabase.from('staff_members').update({ status: 'on_leave' }).eq('id', staff_id);
    }
  }

  return NextResponse.json({ leave: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();

  // Verify ownership via staff_id
  const { data: leaveRow } = await supabase.from('staff_leave').select('staff_id').eq('id', id).single();
  if (!leaveRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ownership = await verifyStaffOwnership(supabase, user.id, leaveRow.staff_id);
  if (!ownership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error: e } = await supabase.from('staff_leave').update(body).eq('id', id).select().single();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ leave: data });
}

export const GET = withErrorCapture('staff/leave', _GET)
export const POST = withErrorCapture('staff/leave', _POST)
export const PATCH = withErrorCapture('staff/leave', _PATCH)
