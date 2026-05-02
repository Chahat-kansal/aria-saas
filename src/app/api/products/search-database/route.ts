export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const category = searchParams.get('category')?.trim() ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);

  if (q.length < 2 && !category) {
    return NextResponse.json({ products: [] });
  }

  let query = supabase
    .from('global_products')
    .select('id, barcode, name, brand, category, size, unit, suggested_price_cents, image_url, is_age_restricted')
    .order('name')
    .limit(limit);

  if (q.length >= 2) {
    query = query.ilike('name', `%${q}%`);
  }

  if (category) {
    query = query.eq('category', category);
  }

  const { data: products, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ products: products ?? [] });
}
