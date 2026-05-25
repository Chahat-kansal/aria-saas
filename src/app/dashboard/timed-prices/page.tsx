import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import TimedPricesApp from '@/components/tickets/TimedPricesApp'

export default async function TimedPricesPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: biz } = await supabase
    .from('businesses').select('id,name,trading_name').eq('user_id', user.id).eq('is_active', true).single()
  if (!biz) redirect('/businesses')

  const [{ data: products }, { data: activeSchedules }] = await Promise.all([
    supabase.from('pos_products').select('id,name,price').eq('business_id', biz.id).eq('is_active', true).order('name').limit(500),
    supabase.from('pos_scheduled_price_changes').select('id,product_id,new_price,effective_date,ends_at,label,status,pos_products(name)').eq('business_id', biz.id).in('status', ['scheduled', 'active']).order('effective_date'),
  ])

  return (
    <TimedPricesApp
      business={biz}
      products={(products ?? []) as Array<{ id: string; name: string; price: number | null }>}
      activeSchedules={(activeSchedules ?? []) as Array<{ id: string; product_id: string; new_price: number; effective_date: string; ends_at: string | null; label: string | null; status: string; pos_products: { name: string } | null }>}
    />
  )
}
