import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { redirect } from 'next/navigation'
import PriceTicketApp from '@/components/tickets/PriceTicketApp'

export const dynamic = 'force-dynamic'

export default async function PriceTicketsPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bizId = (active?.business_id as string | null) ?? (await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()).data?.id as string | null
  if (!bizId) redirect('/onboarding/industry')

  const { data: business } = await supabase.from('businesses').select('id,trading_name,name,logo_url,user_id').eq('id', bizId).maybeSingle()
  if (!business || (business as { user_id: string }).user_id !== user.id) redirect('/login')

  const [{ data: products }, { data: templates }, { data: activeSchedules }] = await Promise.all([
    supabaseAdmin.from('pos_products').select('id,name,sku,barcode,price,description,brand,volume,volume_unit,alcohol_percentage,image_url').eq('business_id', bizId).eq('is_active', true).order('name'),
    supabaseAdmin.from('pos_shelf_ticket_templates').select('*').eq('business_id', bizId).order('created_at'),
    supabaseAdmin.from('pos_scheduled_price_changes').select('*').eq('business_id', bizId).in('status', ['scheduled', 'active']).order('created_at', { ascending: false }),
  ])

  return (
    <PriceTicketApp
      business={business as { id: string; trading_name: string | null; name: string | null; logo_url: string | null }}
      products={(products ?? []) as Array<{ id: string; name: string; sku: string | null; barcode: string | null; price: number | null; description: string | null; brand: string | null }>}
      templates={(templates ?? []) as Array<{ id: string; name: string; [k: string]: unknown }>}
      activeSchedules={(activeSchedules ?? []) as Array<{ id: string; product_id: string; new_price: number; effective_date: string; ends_at: string | null; label: string | null; status: string; pos_products?: { name: string; price: number } | null }>}
    />
  )
}
