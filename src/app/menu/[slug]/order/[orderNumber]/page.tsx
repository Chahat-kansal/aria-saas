import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import OrderTrackingClient from './OrderTrackingClient'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string; orderNumber: string }> | { slug: string; orderNumber: string } }

export default async function OrderTrackingPage({ params }: Props) {
  const { slug, orderNumber } = 'then' in params ? await params : params

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: order } = await supabaseAdmin
    .from('pos_online_orders')
    .select('id, status, order_number, customer_name, total, estimated_ready_at, created_at, items, fulfillment_type, notes, updated_at, picked_up_at')
    .eq('order_number', orderNumber)
    .eq('business_id', bid)
    .maybeSingle()

  if (!order) notFound()

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name')
    .eq('id', bid)
    .maybeSingle()

  return (
    <OrderTrackingClient
      orderId={order.id as string}
      initialStatus={order.status as string}
      orderNumber={order.order_number as string}
      customerName={order.customer_name as string}
      total={Number(order.total ?? 0)}
      estimatedReadyAt={(order.estimated_ready_at as string | null) ?? null}
      createdAt={order.created_at as string}
      items={(order.items as unknown[]) ?? []}
      fulfillmentType={(order.fulfillment_type as string) ?? 'pickup'}
      notes={(order.notes as string | null) ?? null}
      businessName={(biz?.name as string | null) ?? ''}
      slug={slug}
      initialPickedUpAt={(order.picked_up_at as string | null) ?? null}
    />
  )
}