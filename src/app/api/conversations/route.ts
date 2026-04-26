import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('conversations')
    .select('id,title,updated_at,aimodel')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50);

  return NextResponse.json(data || []);
}

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  await supabase.from('conversations').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ success: true });
}