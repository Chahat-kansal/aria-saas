export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

interface OfflineItem {
  product_id?:      string;
  product_name:     string;
  quantity:         number;
  unit_price_cents: number;
  discount_cents?:  number;
  total_cents:      number;
}

interface OfflineSale {
  business_id?:          string;
  session_id?:           string | null;
  items:                 OfflineItem[];
  subtotal_cents:        number;
  discount_cents?:       number;
  tax_cents:             number;
  total_cents:           number;
  payment_method:        string;
  payment_tendered_cents?: number;
  change_cents?:         number;
  status?:               string;
  source?:               string;
  queued_at:             string;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { sales = [], business_id }: { sales: OfflineSale[]; business_id?: string } = body;

  if (!Array.isArray(sales) || sales.length === 0) {
    return NextResponse.json({ synced: 0, errors: 0 });
  }

  // Verify business ownership
  let bid = business_id;
  if (!bid) {
    const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
    bid = biz?.id ?? undefined;
  } else {
    const { data: biz } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', user.id).maybeSingle();
    if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  let synced = 0;
  let errors = 0;

  for (const sale of sales) {
    try {
      const totalDollars = sale.total_cents / 100;
      const taxDollars   = sale.tax_cents   / 100;

      // Insert sale record
      const { data: saleRecord, error: saleErr } = await supabase
        .from('pos_sales')
        .insert({
          business_id:       bid,
          session_id:        sale.session_id ?? null,
          payment_method:    sale.payment_method,
          subtotal:          sale.subtotal_cents / 100,
          tax_amount:        taxDollars,
          discount_amount:   (sale.discount_cents ?? 0) / 100,
          total_amount:      totalDollars,
          cash_tendered:     sale.payment_tendered_cents ? sale.payment_tendered_cents / 100 : null,
          change_given:      sale.change_cents ? sale.change_cents / 100 : null,
          status:            sale.status ?? 'completed',
          source:            sale.source ?? 'mobile_offline',
          synced_from_offline: true,
          offline_queued_at:   sale.queued_at,
        })
        .select('id')
        .single();

      if (saleErr || !saleRecord) { errors++; continue; }

      // Insert sale items
      const items = (sale.items ?? []).map(item => ({
        sale_id:       saleRecord.id,
        business_id:   bid,
        product_id:    item.product_id ?? null,
        product_name:  item.product_name,
        quantity:      item.quantity,
        unit_price:    item.unit_price_cents / 100,
        discount_percent: 0,
        line_total:    item.total_cents / 100,
        tax_rate:      10,
      }));

      if (items.length > 0) {
        await supabase.from('pos_sale_items').insert(items);
      }

      // Update session totals
      if (sale.session_id) {
        const isCard = sale.payment_method === 'card' || sale.payment_method === 'eftpos';
        supabase.rpc('increment_session_totals', {
          p_session_id:        sale.session_id,
          p_cash_delta:        isCard ? 0 : totalDollars,
          p_card_delta:        isCard ? totalDollars : 0,
          p_transaction_delta: 1,
        }).then(() => null, () => null); // non-blocking
      }

      synced++;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ synced, errors, total: sales.length });
}

export const POST = withErrorCapture('pos/sync-offline', _POST)
