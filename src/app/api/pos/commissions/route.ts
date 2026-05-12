export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, sale_id, pos_user_name, rule_id, sale_total_cents, commission_rate, commission_cents } = body;
  if (!business_id || !pos_user_name || !commission_cents) {
    return NextResponse.json({ error: 'business_id, pos_user_name, commission_cents required' }, { status: 400 });
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase.from('pos_commissions').insert({
    business_id, sale_id: sale_id ?? null, pos_user_name,
    rule_id: rule_id ?? null, sale_total_cents, commission_rate, commission_cents,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ commission: data }, { status: 201 });
}

export const POST = withErrorCapture('pos/commissions', _POST)
