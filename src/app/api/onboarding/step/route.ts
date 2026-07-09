import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateBusinessIdAndSlug } from '@/lib/slug';

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
    // A business must NEVER exist without a slug — generate id+slug up front
    // (Sip Café pattern) and retry on the rare unique-index collision.
    let bizErr: { message: string; code?: string } | null = null;
    for (let attempt = 0; attempt < 5 && !biz; attempt++) {
      const { id, slug } = generateBusinessIdAndSlug(name);
      const { data: newBiz, error } = await supabaseAdmin
        .from('businesses')
        .insert({ id, slug, user_id: user.id, name, is_active: true })
        .select('id')
        .single();
      if (!error) { biz = newBiz; bizErr = null; break; }
      bizErr = error;
      if (error.code !== '23505') break; // not a unique-violation — don't retry
    }
    if (!biz) return NextResponse.json({ error: bizErr?.message ?? 'Failed to create business' }, { status: 500 });
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
