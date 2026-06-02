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

  // Latest score per product (most recent scored_at)
  const { data: scores, error } = await supabaseAdmin
    .from('product_performance_scores')
    .select('product_id,bcg_quadrant,velocity_score,margin_score,halo_score,composite_score,grid_position,scored_at,pos_products(name,price,performance_tier)')
    .eq('business_id', bid)
    .order('scored_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deduplicate — keep most recent score per product
  const seen = new Set<string>();
  const latest = (scores ?? []).filter(s => {
    if (seen.has(s.product_id)) return false;
    seen.add(s.product_id);
    return true;
  });

  const byQuadrant = {
    star: latest.filter(s => s.bcg_quadrant === 'star'),
    plowhouse: latest.filter(s => s.bcg_quadrant === 'plowhouse'),
    puzzle: latest.filter(s => s.bcg_quadrant === 'puzzle'),
    dog: latest.filter(s => s.bcg_quadrant === 'dog'),
  };

  return NextResponse.json({ scores: latest, by_quadrant: byQuadrant, total: latest.length });
}

export const GET = withErrorCapture('agents/menu-engineering/scores', _GET);
