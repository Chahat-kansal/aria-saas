import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';

// Use service-role client — webhook is public, no user auth context
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifySignature(body: string, signature: string, url: string): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key) return false;
  const hmac = createHmac('sha256', key);
  hmac.update(url + body);
  const expected = hmac.digest('base64');
  return expected === signature;
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('x-square-hmacsha256-signature') ?? '';
  const url = req.url;

  if (!verifySignature(body, signature, url)) {
    return new Response('Invalid signature', { status: 401 });
  }

  // Return 200 immediately — process async
  const event = JSON.parse(body);
  handleEvent(event).catch(console.error);

  return new Response('OK', { status: 200 });
}

async function handleEvent(event: any) {
  const merchantId = event.merchant_id;
  const type = event.type;

  // Resolve business_id from merchant_id
  const { data: conn } = await supabaseAdmin
    .from('square_connections')
    .select('business_id')
    .eq('square_merchant_id', merchantId)
    .single();

  if (!conn?.business_id) return;
  const business_id = conn.business_id;

  switch (type) {
    case 'inventory.count.updated': {
      const counts = event.data?.object?.inventory_counts ?? [];
      for (const count of counts) {
        if (count.state === 'IN_STOCK') {
          await supabaseAdmin.from('square_items')
            .update({ current_stock: parseInt(count.quantity ?? '0', 10) })
            .eq('business_id', business_id)
            .eq('square_item_id', count.catalog_object_id);
        }
      }
      break;
    }

    case 'catalog.version.updated': {
      // Trigger a re-sync for this business's catalogue
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/square/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id, _cron: true }),
      }).catch(console.error);
      break;
    }

    case 'payment.created': {
      const payment = event.data?.object?.payment;
      if (!payment) break;
      await supabaseAdmin.from('square_sales').upsert({
        business_id,
        square_order_id: payment.order_id ?? payment.id,
        square_payment_id: payment.id,
        total_cents: payment.amount_money?.amount ?? 0,
        tax_cents: payment.total_money?.amount ?? 0,
        payment_method: payment.source_type ?? null,
        sold_at: payment.created_at,
        location_id: payment.location_id ?? null,
        line_items: [],
      }, { onConflict: 'business_id,square_order_id', ignoreDuplicates: true });
      break;
    }

    case 'customer.created':
    case 'customer.updated': {
      const c = event.data?.object?.customer;
      if (!c) break;
      await supabaseAdmin.from('square_customers').upsert({
        business_id,
        square_customer_id: c.id,
        name: [c.given_name, c.family_name].filter(Boolean).join(' ') || null,
        email: c.email_address ?? null,
        phone: c.phone_number ?? null,
        first_visit_at: c.created_at ?? null,
      }, { onConflict: 'business_id,square_customer_id' });
      break;
    }
  }
}
