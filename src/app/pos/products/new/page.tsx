import { createServerSupabaseClient } from '@/lib/supabase-server'
import ProductWizard from '@/components/products/wizard/ProductWizard'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; id?: string }>
}) {
  const { step = '1', id } = await searchParams
  const stepNum = Math.max(1, Math.min(5, parseInt(step) || 1))

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const bid = await getBid(supabase, user.id)
  if (!bid) return null

  // Fetch suppliers, categories, and draft (if id provided)
  const [supRes, catRes, draftRes] = await Promise.all([
    supabase.from('pos_suppliers').select('id,name').eq('business_id', bid).order('name'),
    supabase.from('pos_categories').select('id,name').eq('business_id', bid).order('name'),
    id
      ? supabase.from('pos_products').select('*').eq('id', id).eq('business_id', bid).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)' }}>
      <ProductWizard
        step={stepNum}
        id={id}
        draft={draftRes.data ?? {}}
        suppliers={(supRes.data ?? []) as { id: string; name: string }[]}
        categories={(catRes.data ?? []) as { id: string; name: string }[]}
      />
    </div>
  )
}
