export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq(business_id ? 'id' : 'user_id', business_id ?? user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const bid = biz.id;

  // Latest score per product (unique UNIQUE(business_id,product_id) constraint)
  const { data: scores, error } = await supabaseAdmin
    .from('product_performance_scores')
    .select('product_id,performance_tier,velocity_vs_avg,margin_score,halo_score,composite_score,recommended_grid_position,scored_at,revenue_4h_before_change,revenue_4h_after_change,recommendation_outcome')
    .eq('business_id', bid)
    .order('composite_score', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch today's action stats
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: todayActions } = await supabaseAdmin
    .from('menu_engineering_actions')
    .select('action_type,revenue_impact_actual')
    .eq('business_id', bid)
    .gte('executed_at', todayStart.toISOString());

  const changesToday = (todayActions ?? []).length;
  const revenueToday = (todayActions ?? []).reduce((s, a) => s + Number(a.revenue_impact_actual ?? 0), 0);

  // Detect current mode from recent mode-switching actions
  const { data: modeAction } = await supabaseAdmin
    .from('menu_engineering_actions')
    .select('action_type,executed_at')
    .eq('business_id', bid)
    .in('action_type', ['activate_peak_mode','activate_quiet_mode','activate_margin_mode','restore_normal_mode'])
    .order('executed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let currentMode: 'peak' | 'quiet' | 'margin_max' | 'normal' = 'normal';
  if (modeAction) {
    if (modeAction.action_type === 'activate_peak_mode') currentMode = 'peak';
    else if (modeAction.action_type === 'activate_quiet_mode') currentMode = 'quiet';
    else if (modeAction.action_type === 'activate_margin_mode') currentMode = 'margin_max';
  }

  const list = scores ?? [];
  const byTier = {
    star:      list.filter(s => s.performance_tier === 'star'),
    plowhouse: list.filter(s => s.performance_tier === 'plowhouse'),
    puzzle:    list.filter(s => s.performance_tier === 'puzzle'),
    dog:       list.filter(s => s.performance_tier === 'dog'),
  };

  return NextResponse.json({
    scores: list,
    by_tier: byTier,
    current_mode: currentMode,
    star_count: byTier.star.length,
    plowhouse_count: byTier.plowhouse.length,
    puzzle_count: byTier.puzzle.length,
    dog_count: byTier.dog.length,
    total: list.length,
    changes_today: changesToday,
    revenue_attribution_today: revenueToday,
  });
}

export const GET = withErrorCapture('agents/menu-engineering/scores', _GET);
