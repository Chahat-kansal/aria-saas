import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { PlannedAction } from './action-planner'

export interface ExecutionResult {
  ok: boolean
  affected_count: number
  error?: string
  action_log_id?: string
  rollback_available: boolean
  rollback_expires_at?: string
}

export async function executeAction(
  action: PlannedAction,
  businessId: string,
  userId: string,
  conversationId?: string,
  messageExcerpt?: string,
): Promise<ExecutionResult> {
  const supabase = createServerSupabaseClient()
  let affectedCount = 0
  let beforeState: Record<string, unknown> = {}
  let afterState: Record<string, unknown> = {}
  let entityIds: string[] = []

  try {
    switch (action.type) {
      case 'bulk_price_update': {
        const { category, brand, price_change_type, price_change_value } = action.payload as {
          category?: string; brand?: string
          price_change_type: 'set' | 'increase_pct' | 'decrease_pct' | 'increase_abs' | 'decrease_abs'
          price_change_value: number
        }
        let q = supabase.from('pos_products')
          .select('id,name,price,cost_price')
          .eq('business_id', businessId).eq('is_active', true)
        if (category) q = q.eq('category', category)
        if (brand) q = q.eq('brand', brand)
        const { data: targets } = await q.limit(500)
        if (!targets?.length) return { ok: false, affected_count: 0, error: 'No matching products found', rollback_available: false }

        beforeState = { products: targets.map((p: Record<string,unknown>) => ({ id: p.id, name: p.name, price: p.price })) }
        entityIds = targets.map((p: Record<string,unknown>) => String(p.id))

        for (const product of targets as Array<Record<string,unknown>>) {
          const currentPrice = Number(product.price) || 0
          const costPrice = Number(product.cost_price) || 0
          let newPrice: number
          switch (price_change_type) {
            case 'set': newPrice = Number(price_change_value); break
            case 'increase_pct': newPrice = currentPrice * (1 + Number(price_change_value) / 100); break
            case 'decrease_pct': newPrice = currentPrice * (1 - Number(price_change_value) / 100); break
            case 'increase_abs': newPrice = currentPrice + Number(price_change_value); break
            case 'decrease_abs': newPrice = currentPrice - Number(price_change_value); break
            default: newPrice = currentPrice
          }
          newPrice = Math.max(costPrice, +(newPrice).toFixed(2))
          await supabase.from('pos_products')
            .update({ price: newPrice, updated_at: new Date().toISOString() })
            .eq('id', String(product.id)).eq('business_id', businessId)
          affectedCount++
        }
        afterState = { price_change_type, price_change_value, affected: affectedCount }
        break
      }

      case 'mark_products': {
        const { category, brand, product_ids, field, value } = action.payload as {
          category?: string; brand?: string; product_ids?: string[]
          field: 'is_active' | 'age_restricted'; value: boolean
        }
        let q = supabase.from('pos_products').select('id,name').eq('business_id', businessId)
        if (product_ids?.length) q = q.in('id', product_ids)
        else if (category) q = q.eq('category', category)
        else if (brand) q = q.eq('brand', brand)
        const { data: targets } = await q.limit(500)
        if (!targets?.length) return { ok: false, affected_count: 0, error: 'No matching products', rollback_available: false }

        entityIds = targets.map((p: Record<string,unknown>) => String(p.id))
        beforeState = { field, previous_value: !value, products: targets.map((p: Record<string,unknown>) => p.name) }

        await supabase.from('pos_products')
          .update({ [field]: value, updated_at: new Date().toISOString() })
          .in('id', entityIds).eq('business_id', businessId)
        affectedCount = targets.length
        afterState = { field, new_value: value, affected: affectedCount }
        break
      }

      case 'adjust_stock': {
        const { product_id, product_name, adjust_type, quantity } = action.payload as {
          product_id?: string; product_name?: string
          adjust_type: 'add' | 'subtract' | 'set'; quantity: number
        }
        let productQ = supabase.from('pos_products')
          .select('id,name,stock_quantity').eq('business_id', businessId)
        if (product_id) productQ = productQ.eq('id', product_id)
        else if (product_name) productQ = productQ.ilike('name', `%${product_name}%`)
        const { data: targets } = await productQ.limit(10)
        if (!targets?.length) return { ok: false, affected_count: 0, error: 'Product not found', rollback_available: false }

        entityIds = targets.map((p: Record<string,unknown>) => String(p.id))
        beforeState = { products: targets.map((p: Record<string,unknown>) => ({ id: p.id, name: p.name, stock: p.stock_quantity })) }

        for (const p of targets as Array<Record<string,unknown>>) {
          const current = Number(p.stock_quantity) || 0
          let newQty: number
          switch (adjust_type) {
            case 'add': newQty = current + (Number(quantity) || 0); break
            case 'subtract': newQty = Math.max(0, current - (Number(quantity) || 0)); break
            case 'set': newQty = Math.max(0, Number(quantity) || 0); break
            default: newQty = current
          }
          await supabase.from('pos_products')
            .update({ stock_quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', String(p.id)).eq('business_id', businessId)
          affectedCount++
        }
        afterState = { adjust_type, quantity, affected: affectedCount }
        break
      }

      case 'set_low_stock_threshold': {
        const { category, brand, threshold } = action.payload as {
          category?: string; brand?: string; threshold: number
        }
        let q = supabase.from('pos_products').select('id,name').eq('business_id', businessId).eq('is_active', true)
        if (category) q = q.eq('category', category)
        if (brand) q = q.eq('brand', brand)
        const { data: targets } = await q.limit(500)
        if (!targets?.length) return { ok: false, affected_count: 0, error: 'No matching products', rollback_available: false }

        entityIds = targets.map((p: Record<string,unknown>) => String(p.id))
        beforeState = { threshold_set: threshold, products: targets.map((p: Record<string,unknown>) => p.name) }

        await supabase.from('pos_products')
          .update({ low_stock_threshold: Number(threshold), updated_at: new Date().toISOString() })
          .in('id', entityIds).eq('business_id', businessId)
        affectedCount = targets.length
        afterState = { new_threshold: threshold, affected: affectedCount }
        break
      }

      default:
        return { ok: false, affected_count: 0, error: `Action type "${action.type}" not yet supported`, rollback_available: false }
    }

    // Write immutable audit log
    const { data: logEntry } = await supabase.from('aria_action_log').insert({
      business_id: businessId,
      action_type: action.type,
      entity_type: 'pos_products',
      entity_ids: entityIds,
      before_state: beforeState,
      after_state: afterState,
      triggered_by: 'ask_aria',
      user_id: userId,
      conversation_id: conversationId ?? null,
      message_excerpt: messageExcerpt?.slice(0, 200) ?? null,
      executed_at: new Date().toISOString(),
    }).select('id').single()

    // Write to aria_actions for Brain panel visibility
    const impactNumeric = action.estimated_impact.replace(/[^0-9.]/g, '').slice(0, 10) || '0'
    const impactText = (Number(impactNumeric) || 0).toFixed(2)
    await supabase.from('aria_actions').insert({
      business_id: businessId,
      category: 'sales',
      title: action.title,
      recommendation: action.description,
      expected_impact: impactText,
      confidence: action.risk === 'low' ? 'high' : action.risk === 'medium' ? 'medium' : 'low',
      status: 'completed',
      source: 'ask_aria:action',
      priority: action.risk === 'high' ? 'high' : 'medium',
      triggered_by: 'ask_aria',
      executed_by_user_id: userId,
      payload: {
        action_type: action.type,
        affected_count: affectedCount,
        log_id: (logEntry as { id: string } | null)?.id ?? null,
      },
    })

    return {
      ok: true,
      affected_count: affectedCount,
      action_log_id: (logEntry as { id: string } | null)?.id,
      rollback_available: action.reversible,
      rollback_expires_at: action.reversible ? new Date(Date.now() + 3600_000).toISOString() : undefined,
    }
  } catch (e) {
    return { ok: false, affected_count: affectedCount, error: (e as Error).message, rollback_available: false }
  }
}
