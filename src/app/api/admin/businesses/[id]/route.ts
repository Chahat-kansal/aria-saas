export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAdminClient, logAdminAction, isAdminEmail } from '@/lib/admin';
import { NextResponse } from 'next/server';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = getAdminClient();
  const id = params.id;

  const [
    { data: biz },
    { data: sales },
    { data: products },
    { data: customers },
    { data: staff },
    { data: usage },
    { data: settings },
  ] = await Promise.all([
    db.from('businesses').select('*').eq('id', id).maybeSingle(),
    db.from('pos_sales').select('*').eq('business_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('pos_products').select('id,name,price,cost_price,stock_quantity,barcode,is_active,track_stock,pos_categories(name)').eq('business_id', id).order('name'),
    db.from('pos_customers').select('*').eq('business_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('staff_members').select('*').eq('business_id', id).order('created_at', { ascending: false }),
    db.from('usage_logs').select('event_type,created_at,metadata').eq('business_id', id).order('created_at', { ascending: false }).limit(100),
    db.from('pos_settings').select('*').eq('business_id', id).maybeSingle(),
  ]);

  const totalRevenue = (sales || []).reduce((s, r) => s + ((r.total_amount as number) || 0), 0);

  await logAdminAction({ admin_email: user.email!, action: 'view_business', target_type: 'business', target_id: id, target_name: (biz as any)?.name });

  return NextResponse.json({
    business: biz,
    sales: sales || [],
    products: products || [],
    customers: customers || [],
    staff: staff || [],
    usage: usage || [],
    settings,
    stats: {
      total_revenue: totalRevenue,
      sale_count: (sales || []).length,
      product_count: (products || []).length,
      customer_count: (customers || []).length,
    },
  });
}
