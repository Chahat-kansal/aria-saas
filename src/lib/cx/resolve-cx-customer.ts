import { supabaseAdmin } from '@/lib/supabase-admin'

// RESOLUTION RULE: session → customer must be deterministic.
// Priority: row with E.164 phone (starts '+') > highest points_balance > oldest created_at.
// All CX reads that resolve pos_customers by loyalty_identity_id MUST go through here —
// never a bare .maybeSingle() which throws if the DB briefly has >1 active row.
export async function resolveCxCustomer<T = Record<string, unknown>>(
  identityId: string,
  businessId: string,
  cols: string,
): Promise<T | null> {
  const colList = cols.split(',').map(c => c.trim())
  const extra: string[] = []
  if (!colList.includes('phone'))          extra.push('phone')
  if (!colList.includes('points_balance')) extra.push('points_balance')
  if (!colList.includes('created_at'))     extra.push('created_at')
  const fullCols = extra.length ? cols + ', ' + extra.join(', ') : cols

  const { data: rows } = await supabaseAdmin
    .from('pos_customers')
    .select(fullCols)
    .eq('business_id', businessId)
    .eq('loyalty_identity_id', identityId)
    .is('deleted_at', null)
    .order('points_balance', { ascending: false })
    .order('created_at', { ascending: true })

  if (!rows || rows.length === 0) return null

  const typed = rows as unknown as Array<T & { phone?: string | null }>
  const withNormPhone = typed.find(r => typeof r.phone === 'string' && r.phone.startsWith('+'))
  return (withNormPhone ?? typed[0]) as T
}