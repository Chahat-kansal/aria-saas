import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(_: Request, { params }: { params: { token: string } }) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id,title,messages,aimodel,created_at')
    .eq('share_token', params.token)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

export const GET = withErrorCapture('share/[token]', _GET)
