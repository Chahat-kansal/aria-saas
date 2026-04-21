import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(_: Request, { params }: { params: { token: string } }) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('conversations')
    .select('id,title,messages,aimodel,created_at')
    .eq('share_token', params.token)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
