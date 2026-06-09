import { supabaseAdmin } from '@/lib/supabase-admin'
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
  const supabase = supabaseAdmin
  let affectedCount = 0
  let beforeState: Record<string, unknown> = {}
  let afterState: Record<string, unknown> = {}
  let entityIds: string[] = []
  let entityType = 'pos_products'

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

      case 'create_roster': {
        const { name, week_start, week_end, notes } = action.payload as {
          name: string; week_start: string; week_end?: string; notes?: string
        }
        if (!name || !week_start) return { ok: false, affected_count: 0, error: 'name and week_start required', rollback_available: false }
        entityType = 'pos_rosters'
        const { data: roster, error: rosterErr } = await supabase.from('pos_rosters').insert({
          business_id: businessId,
          name,
          week_start,
          week_end: week_end ?? null,
          status: 'draft',
          published: false,
          generated_by_agent: true,
          notes: notes ?? null,
          total_cost_cents: 0,
          updated_at: new Date().toISOString(),
        }).select('id').single()
        if (rosterErr || !roster) return { ok: false, affected_count: 0, error: rosterErr?.message ?? 'Failed to create roster', rollback_available: false }
        entityIds = [roster.id]
        affectedCount = 1
        afterState = { roster_id: roster.id, name, week_start, status: 'draft' }
        break
      }

      case 'create_invoice': {
        const { customer_name, customer_email, due_date, items, notes } = action.payload as {
          customer_name: string
          customer_email?: string
          due_date?: string
          items?: Array<{ description: string; quantity: number; unit_price: number }>
          notes?: string
        }
        if (!customer_name) return { ok: false, affected_count: 0, error: 'customer_name required', rollback_available: false }
        entityType = 'invoices'
        const lineItems = (items ?? []).map(it => ({
          description: it.description,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          line_total: Math.round((Number(it.quantity) || 1) * (Number(it.unit_price) || 0) * 100) / 100,
        }))
        const subtotal = lineItems.reduce((s, it) => s + it.line_total, 0)
        const taxAmount = Math.round(subtotal * 0.1 * 100) / 100
        const total = Math.round((subtotal + taxAmount) * 100) / 100

        const invoiceNumber = 'INV-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-5)
        const { data: invoice, error: invErr } = await supabase.from('invoices').insert({
          business_id: businessId,
          invoice_number: invoiceNumber,
          customer_name,
          customer_email: customer_email ?? null,
          due_date: due_date ?? null,
          subtotal,
          tax_amount: taxAmount,
          total,
          status: 'draft',
          notes: notes ?? null,
          ai_generated: true,
          updated_at: new Date().toISOString(),
        }).select('id').single()
        if (invErr || !invoice) return { ok: false, affected_count: 0, error: invErr?.message ?? 'Failed to create invoice', rollback_available: false }

        if (lineItems.length) {
          await supabase.from('invoice_line_items').insert(
            lineItems.map(it => ({ ...it, invoice_id: invoice.id, business_id: businessId }))
          )
        }

        entityIds = [invoice.id]
        affectedCount = 1
        afterState = { invoice_id: invoice.id, invoice_number: invoiceNumber, customer_name, total, status: 'draft' }
        break
      }

      case 'create_promotion': {
        const {
          name, promotion_type, discount_amount,
          starts_at, ends_at, min_spend,
          active_days, product_ids, category, notes,
        } = action.payload as {
          name: string; promotion_type: string
          discount_amount?: number
          starts_at?: string; ends_at?: string; min_spend?: number
          active_days?: number[]
          product_ids?: string[]
          category?: string; notes?: string
        }
        if (!name || !promotion_type) {
          return { ok: false, affected_count: 0, error: 'name and promotion_type are required', rollback_available: false }
        }
        // Map planner promotion_type values to DB CHECK constraint values
        const promoTypeMap: Record<string, string> = {
          percent_off: 'percentage_discount',
          amount_off: 'fixed_discount',
          percentage_discount: 'percentage_discount',
          fixed_discount: 'fixed_discount',
          bogo: 'bogo',
          bundle: 'bundle',
          multibuy: 'multibuy',
        }
        // Day-name → ISO number fallback (1=Mon … 7=Sun), in case planner sends names instead of numbers
        const DAY_NAME_TO_ISO: Record<string, number> = {
          monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
          friday: 5, saturday: 6, sunday: 7,
          mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
        }
        const resolvedActiveDays: number[] | null = active_days && active_days.length > 0
          ? active_days.map(d => typeof d === 'string'
              ? (DAY_NAME_TO_ISO[(d as string).toLowerCase()] ?? Number(d))
              : Number(d)).filter(n => n >= 1 && n <= 7)
          : null

        // Infer active_days from the promo name if the planner didn't supply them
        const inferredDaysFromName = ((): number[] | null => {
          if (resolvedActiveDays) return null
          const lower = name.toLowerCase()
          for (const [dayName, isoNum] of Object.entries(DAY_NAME_TO_ISO)) {
            if (lower.includes(dayName)) return [isoNum]
          }
          return null
        })()

        const finalActiveDays = resolvedActiveDays ?? inferredDaysFromName

        const dbPromoType = promoTypeMap[promotion_type] ?? 'percentage_discount'
        entityType = 'pos_promotions'
        const promoRow: Record<string, unknown> = {
          business_id: businessId,
          name,
          promotion_type: dbPromoType,
          discount_amount: Number(discount_amount ?? 10),
          // active=true so the discount engine fires; date-window (starts_at/ends_at) handles scheduling
          active: true,
          is_active: true,
          starts_at: starts_at ?? null,
          ends_at: ends_at ?? null,
          min_spend: min_spend ?? null,
          product_ids: product_ids && product_ids.length > 0 ? product_ids : [],
          category_ids: [],
          active_days: finalActiveDays ?? [1, 2, 3, 4, 5, 6, 7],
          stack_priority: 100,
          current_uses: 0,
          exclude_discounted: false,
          updated_at: new Date().toISOString(),
        }
        if (category) promoRow.applies_to = 'category'
        if (notes) promoRow.notes = notes

        const { data: promo, error: promoErr } = await supabase
          .from('pos_promotions').insert(promoRow).select('id,name').single()
        if (promoErr || !promo) {
          return { ok: false, affected_count: 0, error: promoErr?.message ?? 'Failed to create promotion', rollback_available: false }
        }
        entityIds = [(promo as { id: string }).id]
        affectedCount = 1
        beforeState = {}
        afterState = {
          promotion_id: (promo as { id: string }).id,
          name: (promo as { name: string }).name,
          promotion_type: dbPromoType, discount_amount, active: true,
          active_days: finalActiveDays ?? [1, 2, 3, 4, 5, 6, 7],
          product_ids: product_ids && product_ids.length > 0 ? product_ids : [],
        }
        break
      }

      default:
        return { ok: false, affected_count: 0, error: `Action type "${action.type}" not yet supported`, rollback_available: false }
    }

    // Write immutable audit log
    const { data: logEntry } = await supabase.from('aria_action_log').insert({
      business_id: businessId,
      action_type: action.type,
      entity_type: entityType,
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
      status: 'executed',
      rollback_data: action.reversible ? beforeState : null,
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
