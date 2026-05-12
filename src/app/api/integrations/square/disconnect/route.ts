export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  // Verify ownership
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete the connection record (keeps square_items/sales/customers for historical analysis)
  await supabase.from('square_connections').delete().eq('business_id', business_id);

  // Revert data source
  await supabase.from('businesses').update({
    data_source: 'aria_pos',
    square_connected: false,
  }).eq('id', business_id);

  return NextResponse.json({ ok: true });
}

export const DELETE = withErrorCapture('integrations/square/disconnect', _DELETE)
