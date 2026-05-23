import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, business_model, google_place_id, google_business_url')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const { data: progress } = await supabase
    .from('business_setup_progress')
    .select('completed_tasks, dismissed')
    .eq('business_id', biz.id)
    .maybeSingle();

  const completedTasks: string[] = progress?.completed_tasks ?? [];
  const dismissed = progress?.dismissed ?? false;

  const [
    { count: productCount },
    { count: saleCount },
    { count: hoursCount },
    { count: staffCount },
    { count: serviceCount },
    { count: customerCount },
  ] = await Promise.all([
    supabase.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', biz.id),
    supabase.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', biz.id).eq('status', 'completed'),
    supabase.from('business_hours').select('id', { count: 'exact', head: true }).eq('business_id', biz.id),
    supabase.from('staff_members').select('id', { count: 'exact', head: true }).eq('business_id', biz.id),
    supabase.from('booking_services').select('id', { count: 'exact', head: true }).eq('business_id', biz.id),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', biz.id),
  ]);

  const autoChecks: string[] = [];
  if ((productCount ?? 0) > 0) autoChecks.push('add_product');
  if ((saleCount ?? 0) > 0) autoChecks.push('test_sale');
  if ((hoursCount ?? 0) > 0) autoChecks.push('set_hours');
  if ((staffCount ?? 0) > 0) autoChecks.push('invite_staff');
  if (biz.google_place_id || biz.google_business_url) autoChecks.push('connect_google');
  if ((serviceCount ?? 0) > 0) autoChecks.push('add_service');
  if ((customerCount ?? 0) > 0) autoChecks.push('add_customer');

  const merged = Array.from(new Set([...completedTasks, ...autoChecks]));

  if (merged.length !== completedTasks.length) {
    await supabase.from('business_setup_progress').upsert(
      { business_id: biz.id, user_id: user.id, completed_tasks: merged, updated_at: new Date().toISOString() },
      { onConflict: 'business_id' }
    );
  }

  return NextResponse.json({
    businessId: biz.id,
    businessModel: biz.business_model ?? 'product',
    completedTasks: merged,
    dismissed,
  });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { task_key } = await req.json() as { task_key?: string };
  if (!task_key) return NextResponse.json({ error: 'task_key required' }, { status: 400 });

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const { data: progress } = await supabase
    .from('business_setup_progress')
    .select('completed_tasks')
    .eq('business_id', biz.id)
    .maybeSingle();

  const tasks: string[] = progress?.completed_tasks ?? [];
  if (!tasks.includes(task_key)) tasks.push(task_key);

  await supabase.from('business_setup_progress').upsert(
    { business_id: biz.id, user_id: user.id, completed_tasks: tasks, updated_at: new Date().toISOString() },
    { onConflict: 'business_id' }
  );

  return NextResponse.json({ ok: true, completed_tasks: tasks });
}

export async function PATCH() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 });

  await supabase.from('business_setup_progress').upsert(
    { business_id: biz.id, user_id: user.id, dismissed: true, updated_at: new Date().toISOString() },
    { onConflict: 'business_id' }
  );

  return NextResponse.json({ ok: true });
}
