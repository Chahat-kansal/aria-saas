export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('id', body.business_id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!biz) return NextResponse.json({ error: 'Business not found or unauthorized' }, { status: 403 });

  const bid = biz.id;

  // Reset agent state: clear grid positions, agent overrides, learned weights
  const [productsResult, scoresResult, actionsResult, settingsResult] = await Promise.all([
    supabaseAdmin
      .from('pos_products')
      .update({
        grid_position: null,
        agent_hidden: false,
        agent_upsell_product_id: null,
        agent_bundle_product_id: null,
        agent_bundle_price: null,
        performance_tier: null,
        last_scored_at: null,
      })
      .eq('business_id', bid),
    supabaseAdmin
      .from('product_performance_scores')
      .delete()
      .eq('business_id', bid),
    supabaseAdmin
      .from('menu_engineering_actions')
      .delete()
      .eq('business_id', bid),
    supabaseAdmin
      .from('agent_settings')
      .update({ config: {} })
      .eq('business_id', bid)
      .eq('agent_type', 'menu_engineering'),
  ]);

  const errors = [productsResult.error, scoresResult.error, actionsResult.error, settingsResult.error]
    .filter(Boolean)
    .map(e => e!.message);

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: 'Menu engineering agent reset. Grid positions and scores cleared.' });
}

export const POST = withErrorCapture('agents/menu-engineering/reset', _POST);
