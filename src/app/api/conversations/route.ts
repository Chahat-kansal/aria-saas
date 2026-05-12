import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
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

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  await supabase.from('conversations').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ success: true });
}

export const GET = withErrorCapture('conversations', _GET)
export const DELETE = withErrorCapture('conversations', _DELETE)
