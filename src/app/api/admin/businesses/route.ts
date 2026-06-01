export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAdminClient, logAdminAction, isAdminEmail } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function verifyAdmin() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

async function _GET() {
  const user = await verifyAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = getAdminClient();
  const { data: businesses } = await db
    .from('businesses')
    .select('*')
    .order('created_at', { ascending: false });

  const enriched = await Promise.all((businesses || []).map(async biz => {
    const [
      { count: saleCount },
      { count: productCount },
      { data: revenueRows },
      { data: lastSale },
    ] = await Promise.all([
      db.from('pos_sales').select('*', { count: 'exact', head: true }).eq('business_id', biz.id),
      db.from('pos_products').select('*', { count: 'exact', head: true }).eq('business_id', biz.id),
      db.from('pos_sales').select('total_amount').eq('business_id', biz.id).limit(10000),
      db.from('pos_sales').select('created_at').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(1),
    ]);
    const totalRevenue = (revenueRows || []).reduce((s, r) => s + ((r.total_amount as number) || 0), 0);
    return {
      ...biz,
      sale_count: saleCount || 0,
      product_count: productCount || 0,
      total_revenue: totalRevenue,
      last_sale_at: lastSale?.[0]?.created_at ?? null,
    };
  }));

  return NextResponse.json({ businesses: enriched });
}

async function _PATCH(req: Request) {
  const user = await verifyAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const allowed = ['plan', 'is_active', 'internal_notes', 'trial_ends_at', 'stripe_customer_id'];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) { if (body[k] !== undefined) updates[k] = body[k]; }
  if (body.plan) { updates.plan_override_by = user.email; updates.plan_override_at = new Date().toISOString(); }

  const db = getAdminClient();
  const { data, error } = await db.from('businesses').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({ admin_email: user.email!, action: body.is_active === false ? 'disable_account' : body.plan ? 'set_plan' : 'edit_business', target_type: 'business', target_id: id, details: updates });

  return NextResponse.json({ business: data });
}

export const GET = withErrorCapture('admin/businesses', _GET)
export const PATCH = withErrorCapture('admin/businesses', _PATCH)
