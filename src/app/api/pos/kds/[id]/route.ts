export const dynamic = 'force-dynamic';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { waitUntil } from '@vercel/functions'
import { sendSMS } from '@/lib/clicksend'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

type KdsStatus = 'new' | 'in_progress' | 'ready' | 'delivered' | 'void' | 'fired' | 'bumped';

// GET /api/pos/kds/[station] — returns open tickets for a station (Sprint F)
async function _GET(_req: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id: station } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ tickets: [] });

  let q = supabase
    .from('pos_kds_tickets')
    .select('id, station, course, seat_number, status, fired_at, bumped_at, prep_time_seconds, sale_id, sale_item_id, pos_sales ( sale_number, order_type, customer_name, cover_count, notes ), pos_sale_items ( product_name, variant_label, quantity, modifiers, item_notes, seat_number, course )')
    .eq('business_id', bid)
    .in('status', ['fired', 'in_progress'])
    .order('course', { ascending: true, nullsFirst: false })
    .order('fired_at', { ascending: true })
    .limit(200)

  if (station !== 'all') q = q.eq('station', station)

  const { data: tickets } = await q
  return NextResponse.json({ tickets: tickets ?? [] })
}

export const GET = withErrorCapture('pos/kds/[id]', _GET)

async function _PATCH(req: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = 'then' in params ? await params : params;
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { status }: { status: KdsStatus } = await req.json();
  if (!status) return NextResponse.json({ error: 'status required' }, { status: 400 });

  const validStatuses: KdsStatus[] = ['new', 'in_progress', 'ready', 'delivered', 'void', 'fired', 'bumped'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const now = new Date().toISOString()
  // pos_kds_orders has no updated_at — build a separate, column-safe update object
  const ordersUpdate: Record<string, unknown> = { status }
  if (status === 'in_progress') ordersUpdate.started_at = now
  if (status === 'ready' || status === 'bumped') ordersUpdate.bumped_at = now
  if (status === 'delivered') { ordersUpdate.bumped_at = now; ordersUpdate.completed_at = now }
  if (status === 'void') ordersUpdate.bumped_at = now

  // supabaseAdmin bypasses RLS — pos_kds_orders has RLS enabled with no policies
  const { error: e1, data: d1 } = await supabaseAdmin
    .from('pos_kds_orders')
    .update(ordersUpdate)
    .eq('id', id)
    .eq('business_id', bid)
    .select('id, sale_id')

  if (!e1 && d1 && d1.length > 0) {
    // Sync pos_online_orders + notify customer when kitchen marks order ready
    if (status === 'ready') {
      const updRow = d1[0] as { id: string; sale_id: string | null }
      if (updRow.sale_id) {
        const salId = updRow.sale_id
        const businessId = bid
        waitUntil((async () => {
          try {
            const { data: onlineOrd } = await supabaseAdmin
              .from('pos_online_orders')
              .select('id, status, customer_name, customer_phone, customer_email, order_number, customer_id')
              .eq('sale_id', salId).eq('business_id', businessId).maybeSingle()
            const ord = onlineOrd as { id: string; status: string | null; customer_name: string | null; customer_phone: string | null; customer_email: string | null; order_number: string | null; customer_id: string | null } | null
            if (!ord || ord.status === 'ready' || ord.status === 'completed') return
            const rNow = new Date().toISOString()
            await supabaseAdmin.from('pos_online_orders')
              .update({ status: 'ready', ready_at: rNow, updated_at: rNow }).eq('id', ord.id)
            const { data: biz } = await supabaseAdmin.from('businesses').select('name, slug').eq('id', businessId).maybeSingle()
            const bizName = (biz?.name as string | null) ?? 'the café'
            const bizSlug = (biz?.slug as string | null) ?? ''
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'
            const trackingUrl = appUrl + '/menu/' + bizSlug + '/order/' + (ord.order_number ?? '')
            const firstName = (ord.customer_name ?? '').split(' ')[0] || 'there'
            const orderNum = ord.order_number ?? ''
            if (ord.customer_phone) {
              await sendSMS(
                ord.customer_phone,
                'Hi ' + firstName + ', your order ' + orderNum + ' at ' + bizName + ' is ready for collection! Track: ' + trackingUrl,
                { category: 'transactional', businessId, customerId: ord.customer_id ?? undefined }
              )
            } else if (ord.customer_email) {
              const resendKey = process.env.RESEND_API_KEY
              if (resendKey) {
                await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    from: 'Aria <orders@ariaos.site>',
                    to: [ord.customer_email],
                    subject: 'Your order ' + orderNum + ' is ready! 🎉',
                    html: '<p>Hi ' + firstName + ',</p><p>Your order <strong>' + orderNum + '</strong> at <strong>' + bizName + '</strong> is ready for collection!</p><p><a href="' + trackingUrl + '">Track your order &rarr;</a></p>',
                  }),
                }).catch(() => null)
              }
            }
          } catch (e) {
            void supabaseAdmin.from('activity_log').insert({
              business_id: businessId, action_type: 'kds_online_sync_error',
              description: '[kds/[id]] online order sync failed: ' + (e as Error).message,
              metadata: { kds_order_id: id, sale_id: salId }, created_at: new Date().toISOString(),
            })
          }
        })())
      }
    }
    // Sync pos_online_orders to 'preparing' when kitchen starts cooking
    if (status === 'in_progress') {
      const inPrRow = d1[0] as { id: string; sale_id: string | null }
      if (inPrRow.sale_id) {
        const salId = inPrRow.sale_id
        const businessId = bid
        waitUntil((async () => {
          try {
            const { data: onlineOrd } = await supabaseAdmin
              .from('pos_online_orders').select('id, status')
              .eq('sale_id', salId).eq('business_id', businessId).maybeSingle()
            const ord = onlineOrd as { id: string; status: string | null } | null
            if (!ord || ord.status === 'preparing' || ord.status === 'ready' || ord.status === 'completed') return
            await supabaseAdmin.from('pos_online_orders')
              .update({ status: 'preparing', updated_at: new Date().toISOString() }).eq('id', ord.id)
          } catch (e) {
            void supabaseAdmin.from('activity_log').insert({
              business_id: businessId, action_type: 'kds_online_sync_error',
              description: '[kds/[id]] preparing sync failed: ' + (e as Error).message,
              metadata: { kds_order_id: id }, created_at: new Date().toISOString(),
            })
          }
        })())
      }
    }

    // Sync pos_online_orders to 'completed' + set picked_up_at when kitchen delivers
    if (status === 'delivered') {
      const delRow = d1[0] as { id: string; sale_id: string | null }
      if (delRow.sale_id) {
        const salId = delRow.sale_id
        const businessId = bid
        waitUntil((async () => {
          try {
            const { data: onlineOrd } = await supabaseAdmin
              .from('pos_online_orders').select('id, status')
              .eq('sale_id', salId).eq('business_id', businessId).maybeSingle()
            const ord = onlineOrd as { id: string; status: string | null } | null
            if (!ord || ord.status === 'completed') return
            const dNow = new Date().toISOString()
            await supabaseAdmin.from('pos_online_orders')
              .update({ status: 'completed', picked_up_at: dNow, updated_at: dNow }).eq('id', ord.id)
          } catch (e) {
            void supabaseAdmin.from('activity_log').insert({
              business_id: businessId, action_type: 'kds_online_sync_error',
              description: '[kds/[id]] delivered sync failed: ' + (e as Error).message,
              metadata: { kds_order_id: id }, created_at: new Date().toISOString(),
            })
          }
        })())
      }
    }

    return NextResponse.json({ ok: true })
  }

  // pos_kds_tickets does have updated_at
  const updates: Record<string, unknown> = { status, updated_at: now }
  if (status === 'delivered' || status === 'bumped' || status === 'ready') updates.bumped_at = now

  const { error } = await supabase
    .from('pos_kds_tickets')
    .update(updates)
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorCapture('pos/kds/[id]', _PATCH)
