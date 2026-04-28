import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, updates } = await req.json();
  if (!business_id || !Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'business_id and updates required' }, { status: 400 });
  }

  const { data: business } = await supabase.from('businesses')
    .select('id, data_source').eq('id', business_id).eq('user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const dataSource = business.data_source ?? 'aria_pos';
  const table = dataSource === 'square' ? 'square_items' : 'pos_products';
  const stockCol = dataSource === 'square' ? 'current_stock' : 'stock_quantity';

  let updated = 0;
  const movements = [];

  for (const upd of updates) {
    const { item_id, new_stock, quantity_added } = upd;
    if (!item_id || new_stock == null || quantity_added == null) continue;

    const { error } = await supabase.from(table)
      .update({ [stockCol]: new_stock })
      .eq('id', item_id)
      .eq('business_id', business_id);

    if (!error) {
      updated++;
      movements.push({ business_id, item_id, quantity_added, new_stock, movement_type: 'receipt_scan' });
    }
  }

  if (movements.length > 0) {
    await supabase.from('stock_movements').insert(movements);
  }

  // Log to activity_log
  supabase.from('activity_log').insert({
    business_id,
    action_type: 'receipt_scan',
    description: `Stock-in from receipt scan: ${updated} item${updated !== 1 ? 's' : ''} updated`,
    metadata: { updated_count: updated },
  }).then(() => null, () => null);

  return NextResponse.json({ ok: true, updated });
}
