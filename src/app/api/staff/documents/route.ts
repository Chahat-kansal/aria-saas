import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

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

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { staff_id, business_id, document_type, document_name, file_url, file_size, expiry_date, notes } = body;

  if (!staff_id || !document_type || !document_name) {
    return NextResponse.json({ error: 'staff_id, document_type, document_name required' }, { status: 400 });
  }

  const ownership = await verifyStaffOwnership(supabase, user.id, staff_id);
  if (!ownership) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error: e } = await supabase.from('staff_documents').insert({
    business_id: business_id ?? ownership.business_id,
    staff_id, document_type, document_name,
    file_url: file_url ?? null,
    file_size: file_size ?? null,
    expiry_date: expiry_date ?? null,
    notes: notes ?? null,
  }).select().single();

  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ document: data });
}

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Verify doc belongs to a staff member owned by this user
  const { data: doc } = await supabase.from('staff_documents')
    .select('id, staff_id')
    .eq('id', id)
    .single();
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ownership = await verifyStaffOwnership(supabase, user.id, doc.staff_id);
  if (!ownership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await supabase.from('staff_documents').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
