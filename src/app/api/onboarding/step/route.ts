import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { step, next_step, form } = body as { step: string; next_step: string; form: Record<string, unknown> };

  // Get or create businesses row
  let { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!biz) {
    const name = (form.legal_name as string) || (form.trading_name as string) || 'My Business';
    const { data: newBiz, error: bizErr } = await supabaseAdmin
      .from('businesses')
      .insert({ user_id: user.id, name, is_active: true })
      .select('id')
      .single();
    if (bizErr) return NextResponse.json({ error: bizErr.message }, { status: 500 });
    biz = newBiz;
  }

  // Merge step_data with existing
  const { data: existing } = await supabaseAdmin
    .from('business_onboarding')
    .select('step_data, completed_steps')
    .eq('business_id', biz.id)
    .maybeSingle();

  const prevData = (existing?.step_data as Record<string, unknown>) || {};
  const prevCompleted = (existing?.completed_steps as string[]) || [];
  const mergedData = { ...prevData, ...form };
  const mergedCompleted = Array.from(new Set([...prevCompleted, step]));

  const { error: upsertErr } = await supabaseAdmin
    .from('business_onboarding')
    .upsert(
      { business_id: biz.id, user_id: user.id, current_step: next_step, step_data: mergedData, completed_steps: mergedCompleted },
      { onConflict: 'business_id' }
    );

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  return NextResponse.json({ business_id: biz.id });
}
