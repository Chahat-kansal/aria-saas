export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: grn } = await supabase
    .from('warehouse_grns')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!grn) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify ownership
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', grn.business_id)
    .eq('user_id', user.id)
    .single();

  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ grn });
}

export const GET = withErrorCapture('warehouse/grn/[id]', _GET)
