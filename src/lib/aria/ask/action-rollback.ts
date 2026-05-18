import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function rollbackAction(
  logId: string,
  businessId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string; reverted_count: number }> {
  const supabase = createServerSupabaseClient()

  const { data: log } = await supabase.from('aria_action_log')
    .select('*').eq('id', logId).eq('business_id', businessId).maybeSingle()
  if (!log) return { ok: false, error: 'Action log not found', reverted_count: 0 }
  if (log.rolled_back_at) return { ok: false, error: 'Already rolled back', reverted_count: 0 }

  const cutoff = new Date(Date.now() - 3600_000).toISOString()
  if (String(log.executed_at) < cutoff) {
    return { ok: false, error: 'Rollback window expired (1 hour)', reverted_count: 0 }
  }

  let revertedCount = 0
  const before = log.before_state as Record<string, unknown>

  try {
    if (log.action_type === 'bulk_price_update' && Array.isArray(before.products)) {
      for (const p of before.products as Array<{ id: string; price: number }>) {
        await supabase.from('pos_products')
          .update({ price: Number(p.price), updated_at: new Date().toISOString() })
          .eq('id', p.id).eq('business_id', businessId)
        revertedCount++
      }
    } else if (log.action_type === 'adjust_stock' && Array.isArray(before.products)) {
      for (const p of before.products as Array<{ id: string; stock: number }>) {
        await supabase.from('pos_products')
          .update({ stock_quantity: Number(p.stock), updated_at: new Date().toISOString() })
          .eq('id', p.id).eq('business_id', businessId)
        revertedCount++
      }
    } else if (log.action_type === 'mark_products') {
      const field = String(before.field ?? '')
      const prevValue = before.previous_value as boolean
      if (field && Array.isArray(log.entity_ids) && log.entity_ids.length) {
        await supabase.from('pos_products')
          .update({ [field]: prevValue, updated_at: new Date().toISOString() })
          .in('id', log.entity_ids as string[]).eq('business_id', businessId)
        revertedCount = (log.entity_ids as string[]).length
      }
    } else {
      return { ok: false, error: `Rollback not supported for "${log.action_type}"`, reverted_count: 0 }
    }

    await supabase.from('aria_action_log')
      .update({ rolled_back_at: new Date().toISOString(), rollback_by: userId })
      .eq('id', logId)

    return { ok: true, reverted_count: revertedCount }
  } catch (e) {
    return { ok: false, error: (e as Error).message, reverted_count: revertedCount }
  }
}
