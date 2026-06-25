import { supabaseAdmin } from '@/lib/supabase-admin'
import type { PlannedAction } from './action-planner'
import { buildPromotionRow, normalisePromoKind } from './promotion-writer'
import { adjustOutletStock, resolveOutletId } from '@/lib/inventory/outlet-stock'

export interface ExecutionResult {
  ok: boolean
  affected_count: number
  error?: string
  // ASK-ARIA-CONSOLIDATE-1 (RC3): surfaced so the caller never reports a success it didn't achieve.
  failed_count?: number
  warning?: string
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
  let failedCount = 0
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
          // RC3: check the write — only count rows that actually updated.
          const { error: updErr } = await supabase.from('pos_products')
            .update({ price: newPrice, updated_at: new Date().toISOString() })
            .eq('id', String(product.id)).eq('business_id', businessId)
          if (updErr) { failedCount++; continue }
          affectedCount++
        }
        if (affectedCount === 0 && failedCount > 0) return { ok: false, affected_count: 0, failed_count: failedCount, error: `All ${failedCount} price updates failed.`, rollback_available: false }
        afterState = { price_change_type, price_change_value, affected: affectedCount, failed: failedCount }
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

        const { error: markErr } = await supabase.from('pos_products')
          .update({ [field]: value, updated_at: new Date().toISOString() })
          .in('id', entityIds).eq('business_id', businessId)
        if (markErr) return { ok: false, affected_count: 0, error: `Update failed: ${markErr.message}`, rollback_available: false }
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
        // RC2 (INV spine): stock lives in pos_outlet_inventory.items_on_hand (canonical, per-outlet), NOT
        // pos_products.stock_quantity. Route through adjustOutletStock + an attributed pos_stock_adjustments
        // row — the exact path the staff-app/INV-* tiles use. We also mirror stock_quantity so legacy reads
        // stay in sync (additive — never the source of truth).
        const adjOutletId = await resolveOutletId(supabase, businessId, null)
        const stockMoves: Array<Record<string, unknown>> = []
        for (const p of targets as Array<Record<string,unknown>>) {
          const pid = String(p.id)
          // Canonical on-hand for this outlet. When no row exists yet the canonical truth is 0 (adjustOutletStock
          // creates the row at 0 then applies the delta) — using the legacy stock_quantity here would make a
          // 'set' land on the wrong number. stock_quantity is only ever a mirror, never the delta basis.
          let currentOnHand = 0
          if (adjOutletId) {
            const { data: invRow } = await supabase.from('pos_outlet_inventory').select('items_on_hand')
              .eq('business_id', businessId).eq('product_id', pid).eq('outlet_id', adjOutletId).maybeSingle()
            currentOnHand = invRow ? Number(invRow.items_on_hand) || 0 : 0
          }
          let newQty: number
          switch (adjust_type) {
            case 'add': newQty = currentOnHand + (Number(quantity) || 0); break
            case 'subtract': newQty = Math.max(0, currentOnHand - (Number(quantity) || 0)); break
            case 'set': newQty = Math.max(0, Number(quantity) || 0); break
            default: newQty = currentOnHand
          }
          const delta = newQty - currentOnHand
          if (!adjOutletId) { failedCount++; continue }
          const post = delta !== 0
            ? await adjustOutletStock(supabase, { businessId, outletId: adjOutletId, productId: pid, delta })
            : currentOnHand
          if (post == null) { failedCount++; continue }
          // attributed audit row (text adjusted_by — pos_stock_adjustments.adjusted_by is text)
          if (delta !== 0) {
            await supabase.from('pos_stock_adjustments').insert({
              business_id: businessId, product_id: pid, outlet_id: adjOutletId,
              adjustment_qty: delta, reason: 'ask_aria_adjust', adjusted_by: 'Ask Aria',
            })
          }
          // mirror legacy cache (additive)
          await supabase.from('pos_products').update({ stock_quantity: newQty, updated_at: new Date().toISOString() }).eq('id', pid).eq('business_id', businessId)
          stockMoves.push({ product_id: pid, name: p.name, from: currentOnHand, to: newQty, delta })
          affectedCount++
        }
        beforeState = { products: stockMoves.map(m => ({ id: m.product_id, name: m.name, stock: m.from })) }
        if (affectedCount === 0) return { ok: false, affected_count: 0, failed_count: failedCount, error: 'Could not adjust stock — no outlet resolved for this business.', rollback_available: false }
        afterState = { adjust_type, quantity, affected: affectedCount, canonical: 'items_on_hand', moves: stockMoves }
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

        const { error: thrErr } = await supabase.from('pos_products')
          .update({ low_stock_threshold: Number(threshold), updated_at: new Date().toISOString() })
          .in('id', entityIds).eq('business_id', businessId)
        if (thrErr) return { ok: false, affected_count: 0, error: `Update failed: ${thrErr.message}`, rollback_available: false }
        affectedCount = targets.length
        afterState = { new_threshold: threshold, affected: affectedCount }
        break
      }

      case 'create_roster': {
        const { name, week_start, notes } = action.payload as {
          name?: string; week_start: string; notes?: string
        }
        if (!week_start) return { ok: false, affected_count: 0, error: 'week_start required', rollback_available: false }
        entityType = 'pos_rosters'
        // RC2: pos_rosters has NO `name`/`week_end`/`notes` columns. Required: outlet_id + shifts (jsonb).
        // Resolve the business's default outlet; an empty draft roster (owner fills shifts) is valid.
        const rosterOutlet = await resolveOutletId(supabase, businessId, null)
        if (!rosterOutlet) return { ok: false, affected_count: 0, error: 'No outlet found for this business — set up an outlet before drafting a roster.', rollback_available: false }
        const { data: roster, error: rosterErr } = await supabase.from('pos_rosters').insert({
          business_id: businessId,
          outlet_id: rosterOutlet,
          week_start,
          shifts: [],
          status: 'draft',
          published: false,
          generated_by_agent: true,
          aria_reasoning: notes ?? (name ? `Draft: ${name}` : null),
          total_cost_cents: 0,
          total_hours: 0,
          updated_at: new Date().toISOString(),
        }).select('id').single()
        if (rosterErr || !roster) return { ok: false, affected_count: 0, error: rosterErr?.message ?? 'Failed to create roster', rollback_available: false }
        entityIds = [roster.id]
        affectedCount = 1
        afterState = { roster_id: roster.id, name: name ?? null, week_start, status: 'draft' }
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
        // RC2: real columns are bill_to_name/bill_to_email + gst_total (NOT customer_name/customer_email/
        // tax_amount). Line items require gst_applicable + line_subtotal + line_gst (all NOT NULL).
        const lineItems = (items ?? []).map((it, idx) => {
          const qty = Number(it.quantity) || 1
          const unit = Number(it.unit_price) || 0
          const lineSubtotal = Math.round(qty * unit * 100) / 100
          const lineGst = Math.round(lineSubtotal * 0.1 * 100) / 100
          return {
            description: it.description,
            quantity: qty,
            unit_price: unit,
            gst_applicable: true,
            line_subtotal: lineSubtotal,
            line_gst: lineGst,
            line_total: Math.round((lineSubtotal + lineGst) * 100) / 100,
            position: idx,
          }
        })
        const subtotal = lineItems.reduce((s, it) => s + it.line_subtotal, 0)
        const gstTotal = Math.round(lineItems.reduce((s, it) => s + it.line_gst, 0) * 100) / 100
        const total = Math.round((subtotal + gstTotal) * 100) / 100

        const invoiceNumber = 'INV-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-5)
        const { data: invoice, error: invErr } = await supabase.from('invoices').insert({
          business_id: businessId,
          invoice_number: invoiceNumber,
          bill_to_name: customer_name,
          bill_to_email: customer_email ?? null,
          due_date: due_date ?? null,
          subtotal,
          gst_total: gstTotal,
          total,
          status: 'draft',
          notes: notes ?? null,
          ai_generated: true,
          updated_at: new Date().toISOString(),
        }).select('id').single()
        if (invErr || !invoice) return { ok: false, affected_count: 0, error: invErr?.message ?? 'Failed to create invoice', rollback_available: false }

        if (lineItems.length) {
          const { error: liErr } = await supabase.from('invoice_line_items').insert(
            lineItems.map(it => ({ ...it, invoice_id: invoice.id, business_id: businessId }))
          )
          if (liErr) return { ok: false, affected_count: 1, error: `Invoice created but line items failed: ${liErr.message}`, rollback_available: false }
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
          active_days, product_ids, category_id, buy_quantity, get_quantity, notes,
        } = action.payload as {
          name: string; promotion_type: string
          discount_amount?: number
          starts_at?: string; ends_at?: string; min_spend?: number
          active_days?: Array<number | string>
          product_ids?: string[]
          category_id?: string; buy_quantity?: number; get_quantity?: number; notes?: string
        }
        if (!name || !promotion_type) {
          return { ok: false, affected_count: 0, error: 'name and promotion_type are required', rollback_available: false }
        }
        // RC1: ALL pos_promotions writes go through the validated buildPromotionRow — it sets the columns the
        // discount engine actually reads per type, and refuses to write a dead/unusable promo.
        const kind = normalisePromoKind(promotion_type)
        if (!kind) return { ok: false, affected_count: 0, error: `Unknown promotion type "${promotion_type}". Use percentage, fixed, bogo, or bundle.`, rollback_available: false }

        // Day-name → ISO number (1=Mon … 7=Sun); also infer a single day from the promo name.
        const DAY_NAME_TO_ISO: Record<string, number> = {
          monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
          mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
        }
        const resolvedActiveDays: number[] | null = active_days && active_days.length > 0
          ? active_days.map(d => typeof d === 'string' ? (DAY_NAME_TO_ISO[d.toLowerCase()] ?? Number(d)) : Number(d)).filter(n => n >= 1 && n <= 7)
          : null
        const inferredDaysFromName = ((): number[] | null => {
          if (resolvedActiveDays) return null
          const lower = name.toLowerCase()
          for (const [dayName, isoNum] of Object.entries(DAY_NAME_TO_ISO)) if (lower.includes(dayName)) return [isoNum]
          return null
        })()
        const finalActiveDays = resolvedActiveDays ?? inferredDaysFromName

        entityType = 'pos_promotions'
        const built = buildPromotionRow({
          businessId, name, kind,
          value: discount_amount,
          scope: category_id ? 'category' : (product_ids && product_ids.length ? 'product' : 'all'),
          categoryId: category_id ?? null,
          productIds: product_ids ?? null,
          startsAt: starts_at ?? null, endsAt: ends_at ?? null, minSpend: min_spend ?? null,
          activeDays: finalActiveDays, buyQuantity: buy_quantity, getQuantity: get_quantity, notes: notes ?? null,
        })
        if (!built.ok) return { ok: false, affected_count: 0, error: built.error, rollback_available: false }

        const { data: promo, error: promoErr } = await supabase
          .from('pos_promotions').insert(built.row).select('id,name').single()
        if (promoErr || !promo) {
          return { ok: false, affected_count: 0, error: promoErr?.message ?? 'Failed to create promotion', rollback_available: false }
        }
        entityIds = [(promo as { id: string }).id]
        affectedCount = 1
        beforeState = {}
        afterState = {
          promotion_id: (promo as { id: string }).id,
          name: (promo as { name: string }).name,
          promotion_type: built.row.promotion_type,
          discount_percent: built.row.discount_percent ?? null,
          discount_amount: built.row.discount_amount ?? null,
          bundle_price: built.row.bundle_price ?? null,
          active: true,
          active_days: built.row.active_days,
          product_ids: built.row.product_ids,
        }
        break
      }

      case 'apply_category_discount': {
        const {
          category_id, category_name, discount_percent,
          starts_at, ends_at, active_days, name, notes,
        } = action.payload as {
          category_id: string; category_name?: string
          discount_percent?: number
          starts_at?: string; ends_at?: string
          active_days?: number[]
          name?: string; notes?: string
        }
        if (!category_id) {
          return { ok: false, affected_count: 0, error: 'category_id is required for apply_category_discount', rollback_available: false }
        }

        // Verify category belongs to this business
        const { data: catRow } = await supabase.from('pos_categories')
          .select('id,name').eq('id', category_id).eq('business_id', businessId).maybeSingle()
        if (!catRow) {
          const { data: allCats } = await supabase.from('pos_categories')
            .select('name').eq('business_id', businessId).order('name')
          const catList = (allCats ?? []).map((c: Record<string,unknown>) => String(c.name)).join(', ')
          return { ok: false, affected_count: 0, error: `Category not found. Available categories: ${catList || 'none'}`, rollback_available: false }
        }

        const DAY_NAME_TO_ISO_CAT: Record<string, number> = {
          monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
          friday: 5, saturday: 6, sunday: 7,
          mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
        }
        const resolvedCatDays: number[] | null = active_days && active_days.length > 0
          ? active_days.map(d => typeof d === 'string'
              ? (DAY_NAME_TO_ISO_CAT[(d as string).toLowerCase()] ?? Number(d))
              : Number(d)).filter(n => n >= 1 && n <= 7)
          : null

        const pct = Number(discount_percent ?? 10)
        const promoName = name ?? `${catRow.name} ${pct}% off`

        entityType = 'pos_promotions'
        // RC1: same validated writer — category-scoped percentage promo.
        const catBuilt = buildPromotionRow({
          businessId, name: promoName, kind: 'percentage', value: pct,
          scope: 'category', categoryId: category_id,
          startsAt: starts_at ?? null, endsAt: ends_at ?? null,
          activeDays: resolvedCatDays, notes: notes ?? null,
        })
        if (!catBuilt.ok) return { ok: false, affected_count: 0, error: catBuilt.error, rollback_available: false }

        const { data: catPromo, error: catPromoErr } = await supabase
          .from('pos_promotions').insert(catBuilt.row).select('id,name').single()
        if (catPromoErr || !catPromo) {
          return { ok: false, affected_count: 0, error: catPromoErr?.message ?? 'Failed to create category promotion', rollback_available: false }
        }
        entityIds = [(catPromo as { id: string }).id]
        affectedCount = 1
        beforeState = {}
        afterState = {
          promotion_id: (catPromo as { id: string }).id,
          name: (catPromo as { name: string }).name,
          promotion_type: 'percentage_discount',
          discount_percent: pct,
          applies_to: 'category',
          category_id,
          category_name: category_name ?? (catRow as { name: string }).name,
          active: true,
          active_days: resolvedCatDays ?? [1, 2, 3, 4, 5, 6, 7],
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
      failed_count: failedCount > 0 ? failedCount : undefined,
      warning: failedCount > 0 ? `${affectedCount} updated, ${failedCount} failed.` : undefined,
      action_log_id: (logEntry as { id: string } | null)?.id,
      rollback_available: action.reversible,
      rollback_expires_at: action.reversible ? new Date(Date.now() + 3600_000).toISOString() : undefined,
    }
  } catch (e) {
    return { ok: false, affected_count: affectedCount, error: (e as Error).message, rollback_available: false }
  }
}
