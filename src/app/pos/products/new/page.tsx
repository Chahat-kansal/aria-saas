import { createServerSupabaseClient } from '@/lib/supabase-server'
import { ProductForm } from '@/components/pos/ProductForm'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

export default async function NewProductPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const bid = await getBid(supabase, user.id)
  if (!bid) return null

  const [supRes, catRes] = await Promise.all([
    supabase.from('pos_suppliers').select('id,name').eq('business_id', bid).order('name'),
    supabase.from('pos_categories').select('id,name').eq('business_id', bid).order('name'),
  ])

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <ProductForm
        mode="create"
        suppliers={(supRes.data ?? []) as { id: string; name: string }[]}
        categories={(catRes.data ?? []) as { id: string; name: string }[]}
      />
    </div>
  )
}
