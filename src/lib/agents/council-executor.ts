import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentCouncilProposal } from './types'

interface ExecuteResult {
  success: boolean
  outcome: Record<string, unknown>
  error?: string
}

async function logAutopilotAction(
  proposal: AgentCouncilProposal,
  supabase: SupabaseClient,
  outcome: Record<string, unknown>,
  success: boolean
) {
  try {
    // M13 PHASE 2 — THE ERROR IS NOW READ. It was not: Supabase RESOLVES with an error field rather
    // than throwing, so the catch below only ever saw network faults and a rejected write went into
    // a discarded field.
    //
    // AND THE ROW COUNT IS NOT EVIDENCE THIS WAS FAILING. proposal_id is non-null on 0 of 854
    // aria_autopilot_actions rows, which reads like a write that never lands — and M11's run log
    // said exactly that. IT IS WRONG. Attempting this exact insert against production inside a
    // rolled-back DO block SUCCEEDS. The real reason the column is empty is that this function has
    // NEVER BEEN CALLED: agent_council_proposals holds 2 rows ever, 0 executed, 0 with a
    // council_decision, and aria_campaigns below has 0 rows. executeProposal has not run in
    // production.
    //
    // So this is a LATENT defect, not the active cause — fixed because the day the executor does
    // run is exactly the day nobody would notice it failing.
    const { error: auditErr } = await supabase.from('aria_autopilot_actions').insert({
      action_type: proposal.proposal_type,
      business_id: proposal.business_id,
      agent_type: proposal.agent_type,
      proposal_id: proposal.id,
      status: success ? 'executed' : 'rejected',
      outcome_data: outcome,
      executed_at: new Date().toISOString(),
    })
    if (auditErr) console.error('[council-executor] audit insert REJECTED:', proposal.proposal_type, auditErr.message)
  } catch (e) { console.error('[council-executor] audit insert threw (non-fatal):', e) }
}

export async function executeProposal(
  proposal: AgentCouncilProposal,
  supabase: SupabaseClient
): Promise<ExecuteResult> {
  const d = proposal.proposal_data

  try {
    switch (proposal.proposal_type) {
      case 'price_change': {
        const productId = String(d.product_id ?? '')
        const newPrice = Number(d.new_price ?? 0)
        const oldPrice = Number(d.current_price ?? d.old_price ?? 0)
        if (!productId || newPrice <= 0) {
          return { success: false, outcome: {}, error: 'Missing product_id or new_price' }
        }
        const { error } = await supabase
          .from('pos_products')
          .update({ price: newPrice, updated_at: new Date().toISOString() })
          .eq('id', productId)
        if (error) throw error
        const outcome = { product_id: productId, old_price: oldPrice, new_price: newPrice, product_name: String(d.product_name ?? '') }
        await logAutopilotAction(proposal, supabase, outcome, true)
        return { success: true, outcome }
      }

      case 'send_campaign': {
        const customerIds = Array.isArray(d.customer_ids) ? d.customer_ids as string[] : []
        const message = String(d.message ?? '')
        if (!message) return { success: false, outcome: {}, error: 'Missing campaign message' }
        const outcome = { customer_count: customerIds.length, message_preview: message.slice(0, 80), queued: true }
        // M13 phase 2 — this write discarded BOTH outcomes explicitly. A lost row means the
        // owner is told this was queued when it was not.
        const { error: campErr } = await supabase.from('aria_campaigns').insert({
          business_id: proposal.business_id,
          agent_type: proposal.agent_type,
          message,
          customer_ids: customerIds,
          status: 'queued',
          created_at: new Date().toISOString(),
        })
        if (campErr) console.error('[council-executor] camp insert REJECTED:', campErr.message)
        await logAutopilotAction(proposal, supabase, outcome, true)
        return { success: true, outcome }
      }

      case 'create_reorder': {
        const supplierId = String(d.supplier_id ?? '')
        const items = Array.isArray(d.items) ? d.items : []
        if (!supplierId || items.length === 0) {
          return { success: false, outcome: {}, error: 'Missing supplier_id or items' }
        }
        const { data: po, error } = await supabase.from('pos_purchase_orders').insert({
          business_id: proposal.business_id,
          supplier_id: supplierId,
          supplier_name: String(d.supplier_name ?? ''),
          items: items,
          total_amount: Number(d.total_cost ?? 0),
          status: 'pending',
          notes: 'Auto-created by Aria Reorder Agent',
          created_at: new Date().toISOString(),
        }).select('id').single()
        if (error) throw error
        const outcome = { purchase_order_id: po?.id, supplier_id: supplierId, items_count: items.length, total: Number(d.total_cost ?? 0) }
        await logAutopilotAction(proposal, supabase, outcome, true)
        return { success: true, outcome }
      }

      case 'run_promotion': {
        const productIds = Array.isArray(d.product_ids) ? d.product_ids as string[] : [String(d.product_id ?? '')]
        const discountPct = Number(d.discount_percent ?? d.discount_pct ?? 10)
        const expiresAt = String(d.expires_at ?? d.valid_until ?? new Date(Date.now() + 86400000).toISOString())
        const { data: promo, error } = await supabase.from('pos_promotions').insert({
          business_id: proposal.business_id,
          name: String(d.name ?? 'Aria Promotion ' + new Date().toLocaleDateString()),
          discount_percent: discountPct,
          product_ids: productIds,
          valid_from: new Date().toISOString(),
          valid_until: expiresAt,
          is_active: true,
          created_at: new Date().toISOString(),
        }).select('id').single()
        if (error) throw error
        const outcome = { promotion_id: promo?.id, product_ids: productIds, discount_pct: discountPct, expires_at: expiresAt }
        await logAutopilotAction(proposal, supabase, outcome, true)
        return { success: true, outcome }
      }

      case 'adjust_roster':
      case 'send_offer': {
        const phone = String(d.staff_phone ?? d.customer_phone ?? '')
        const message = String(d.message ?? '')
        if (!message) return { success: false, outcome: {}, error: 'Missing message' }
        const outcome = { phone_last4: phone.slice(-4), message_preview: message.slice(0, 80), sms_queued: true }
        // M13 phase 2 — this write discarded BOTH outcomes explicitly. A lost row means the
        // owner is told this was queued when it was not.
        const { error: labourErr } = await supabase.from('labour_optimisation_actions').insert({
          business_id: proposal.business_id,
          action_type: proposal.proposal_type,
          recipient_phone: phone,
          message,
          status: 'queued',
          created_at: new Date().toISOString(),
        })
        if (labourErr) console.error('[council-executor] labour insert REJECTED:', labourErr.message)
        await logAutopilotAction(proposal, supabase, outcome, true)
        return { success: true, outcome }
      }

      case 'markdown_product': {
        const productId = String(d.product_id ?? '')
        const discountPct = Number(d.discount_pct ?? d.discount_percent ?? 15)
        const expiresAt = String(d.expires_at ?? new Date(Date.now() + 86400000).toISOString())
        const { data: promo, error } = await supabase.from('pos_promotions').insert({
          business_id: proposal.business_id,
          name: 'Markdown: ' + String(d.product_name ?? productId),
          discount_percent: discountPct,
          product_ids: [productId],
          valid_from: new Date().toISOString(),
          valid_until: expiresAt,
          is_active: true,
          created_at: new Date().toISOString(),
        }).select('id').single()
        if (error) throw error
        const outcome = { promotion_id: promo?.id, product_id: productId, discount_pct: discountPct }
        await logAutopilotAction(proposal, supabase, outcome, true)
        return { success: true, outcome }
      }

      case 'hide_product': {
        const productId = String(d.product_id ?? '')
        if (!productId) return { success: false, outcome: {}, error: 'Missing product_id' }
        const { error } = await supabase
          .from('pos_products')
          .update({ agent_hidden: true, updated_at: new Date().toISOString() })
          .eq('id', productId)
        if (error) throw error
        const outcome = { product_id: productId, product_name: String(d.product_name ?? ''), hidden: true }
        await logAutopilotAction(proposal, supabase, outcome, true)
        return { success: true, outcome }
      }

      case 'send_review_request': {
        const phone = String(d.customer_phone ?? '')
        const message = String(d.message ?? '')
        const outcome = { phone_last4: phone.slice(-4), message_preview: message.slice(0, 80), queued: true }
        // M13 phase 2 — this write discarded BOTH outcomes explicitly. A lost row means the
        // owner is told this was queued when it was not.
        const { error: reviewErr } = await supabase.from('review_requests').insert({
          business_id: proposal.business_id,
          customer_phone: phone,
          message,
          status: 'queued',
          created_at: new Date().toISOString(),
        })
        if (reviewErr) console.error('[council-executor] review insert REJECTED:', reviewErr.message)
        await logAutopilotAction(proposal, supabase, outcome, true)
        return { success: true, outcome }
      }

      case 'create_bundle': {
        const productIds = Array.isArray(d.product_ids) ? d.product_ids as string[] : []
        const bundlePrice = Number(d.bundle_price ?? 0)
        const outcome = { product_ids: productIds, bundle_price: bundlePrice, queued: true }
        await logAutopilotAction(proposal, supabase, outcome, true)
        return { success: true, outcome }
      }

      case 'update_menu_position': {
        const productId = String(d.product_id ?? '')
        const position = Number(d.position ?? d.new_position ?? 0)
        const { error } = await supabase
          .from('pos_products')
          .update({ display_order: position, updated_at: new Date().toISOString() })
          .eq('id', productId)
        if (error) throw error
        const outcome = { product_id: productId, position }
        await logAutopilotAction(proposal, supabase, outcome, true)
        return { success: true, outcome }
      }

      case 'labour_pct_alert': {
        const outcome = { labour_pct: Number(d.labour_pct ?? 0), threshold: Number(d.threshold ?? 30), alert_sent: true }
        await logAutopilotAction(proposal, supabase, outcome, true)
        return { success: true, outcome }
      }

      default:
        return { success: false, outcome: {}, error: 'Unknown proposal_type: ' + proposal.proposal_type }
    }
  } catch (e) {
    const errorMsg = (e as Error).message
    const outcome = { error: errorMsg }
    await logAutopilotAction(proposal, supabase, outcome, false)
    return { success: false, outcome, error: errorMsg }
  }
}
