import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifyStaff(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  staffId: string
) {
  const { data } = await supabase
    .from('staff_members')
    .select('id, business_id, businesses!inner(user_id)')
    .eq('id', staffId)
    .single();
  if (!data) return null;
  if ((data.businesses as any).user_id !== userId) return null;
  return data;
}

async function _GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const record = await verifyStaff(supabase, user.id, params.id);
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Full profile including sensitive fields (single-record GET only)
  const [staffRes, docsRes, leaveRes] = await Promise.all([
    supabase.from('staff_members').select('*').eq('id', params.id).single(),
    supabase.from('staff_documents').select('*').eq('staff_id', params.id).order('uploaded_at', { ascending: false }),
    supabase.from('staff_leave').select('*').eq('staff_id', params.id).order('start_date', { ascending: false }),
  ]);

  return NextResponse.json({
    staff: staffRes.data,
    documents: docsRes.data ?? [],
    leave: leaveRes.data ?? [],
  });
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const record = await verifyStaff(supabase, user.id, params.id);
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  // Remove read-only fields
  delete body.id; delete body.business_id; delete body.created_at;
  body.updated_at = new Date().toISOString();

  const { data, error: e } = await supabase.from('staff_members')
    .update(body)
    .eq('id', params.id)
    .select('*')
    .single();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ staff: data });
}

async function _DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const record = await verifyStaff(supabase, user.id, params.id);
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Soft delete
  await supabase.from('staff_members').update({
    status: 'terminated',
    end_date: new Date().toISOString().split('T')[0],
    updated_at: new Date().toISOString(),
  }).eq('id', params.id);

  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('staff/[id]', _GET)
export const PATCH = withErrorCapture('staff/[id]', _PATCH)
export const DELETE = withErrorCapture('staff/[id]', _DELETE)
