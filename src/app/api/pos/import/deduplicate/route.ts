export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch all active products
  const { data: products, error } = await supabase
    .from('pos_products')
    .select('id, name, sku, barcode, price, source, created_at')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by normalised name
  const nameGroups: Record<string, typeof products> = {};
  for (const p of products ?? []) {
    const key = p.name.toLowerCase().trim().replace(/\s+/g, ' ');
    if (!nameGroups[key]) nameGroups[key] = [];
    nameGroups[key]!.push(p);
  }

  // Build duplicate pairs
  const duplicates: Array<{
    name: string;
    products: Array<{ id: string; name: string; source: string; price: number; sku: string | null; barcode: string | null; created_at: string }>;
  }> = [];

  for (const [, group] of Object.entries(nameGroups)) {
    if ((group?.length ?? 0) > 1) {
      duplicates.push({
        name: group![0].name,
        products: group!.map(p => ({
          id: p.id,
          name: p.name,
          source: p.source ?? 'manual',
          price: p.price,
          sku: p.sku,
          barcode: p.barcode,
          created_at: p.created_at,
        })),
      });
    }
  }

  return NextResponse.json({ duplicates, count: duplicates.length });
}

// DELETE — merge two products (keep winner, delete loser)
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, keep_id, delete_id } = await req.json();
  if (!business_id || !keep_id || !delete_id) {
    return NextResponse.json({ error: 'business_id, keep_id, delete_id required' }, { status: 400 });
  }

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Soft-delete the duplicate
  const { error } = await supabase.from('pos_products')
    .update({ is_active: false })
    .eq('id', delete_id)
    .eq('business_id', business_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const POST = withErrorCapture('pos/import/deduplicate', _POST)
export const DELETE = withErrorCapture('pos/import/deduplicate', _DELETE)
