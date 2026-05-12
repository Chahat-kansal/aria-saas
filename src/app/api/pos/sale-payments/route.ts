export const dynamic = 'force-dynamic';
export const maxDuration = 10;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sale_id, method, amount_cents, reference } = await req.json();
  if (!sale_id || !method || !amount_cents) {
    return NextResponse.json({ error: 'sale_id, method, amount_cents required' }, { status: 400 });
  }

  const { data, error: insertErr } = await supabase.from('pos_sale_payments').insert({
    sale_id, method, amount_cents, reference: reference ?? null,
  }).select('id').single();

  if (insertErr) {
    console.error('[sale-payments] insert failed:', insertErr.message);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: data?.id });
}

export const POST = withErrorCapture('pos/sale-payments', _POST)
