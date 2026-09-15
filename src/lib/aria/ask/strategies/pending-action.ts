/**
 * M17 · BRAIN-1 PHASE 3 — THE `pending_action` LANE, WRAPPED.
 *
 * Moved from `src/app/api/aria/ask/route.ts:452–611`. FOUR exits: expired, mass-confirm, failed, executed. The mass-confirm one is the injection backstop — even a planner talked into a catalog-wide change cannot execute without a second confirmation naming the exact count.
 *
 * ⚠️ MOVED, NOT REWRITTEN. The body below is the lane's own lines. The only edits are the ones the
 * spine requires:
 *   · `return NextResponse.json(X)`  →  `return makeTurnResult('pending_action', X)`
 *   · the lane's locally-declared routing regexes read `understanding.features` instead, because
 *     stage 1 already computed them from byte-identical patterns (see pipeline/features.ts)
 *   · falling off the end is now `return null` — an explicit DECLINE, which is what the original
 *     `try/catch → fall through` and `if (…)` -not-taken did implicitly
 *
 * Nothing else changed: not the order of operations, not an error message, not a comment.
 */
import { makeTurnResult } from '../pipeline/types'
import type { StrategyFn } from '../pipeline/run-turn'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { executeAction } from '@/lib/aria/ask/action-executor'
import { isConfirmation } from '@/lib/aria/ask/action-planner'
import type { PlannedAction } from '@/lib/aria/ask/action-planner'
import { runAriaCouncil, type CouncilOutput } from '@/lib/aria/answer-council'
import { getBusinessContext } from '@/lib/aria/get-business-context'
import { upsertConversation } from '../pipeline/turn-persistence'

export const pendingActionStrategy: StrategyFn = async ({ input, understanding }) => {
  const { bid, userId, supabase, message, conversationId } = input

  // 1a. Check if a pending action awaits confirmation
  if (conversationId) {
    const { data: convPending, error: pendingErr } = await supabase.from('aria_conversations')
      .select('pending_action,pending_action_expires_at')
      .eq('id', conversationId).eq('business_id', bid).maybeSingle()
    // WALL 6 — a lost read here reads as "there is no pending action", so the owner's "confirm"
    // falls through to smalltalk and the action they approved never runs. Silent until now.
    if (pendingErr) console.error('[aria/ask] pending_action read failed:', pendingErr.message)

    if (convPending?.pending_action && isConfirmation(message)) {
      const expired = convPending.pending_action_expires_at &&
        new Date(String(convPending.pending_action_expires_at)) < new Date()

      // Explicit expired branch — never fall through to smalltalk
      if (expired) {
        const expiredText = "Your action plan has expired — please re-request the action and I'll set it up again."
        let expConvId = conversationId
        try { expConvId = await upsertConversation(bid, userId, conversationId, message, expiredText, 'action_expired') } catch (_e) { /* non-fatal */ }
        return makeTurnResult('pending_action', {
          response: expiredText,
          conversation_id: expConvId ?? conversationId,
          intent: 'action_expired',
          action: null,
          cost_usd_cents: 0,
        })
      }

      if (!expired) {
        // BUG 1 FIX: pending_action may be stored as a text/string column and returned
        // as a JSON string by the Supabase client. Safe-parse it into a real object so
        // action.type is accessible inside executeAction.
        const rawPending = convPending.pending_action
        const parsedPending: PlannedAction = typeof rawPending === 'string'
          ? JSON.parse(rawPending) as PlannedAction
          : rawPending as PlannedAction

        const result = await executeAction(parsedPending, bid, userId, conversationId, message)

        // RC2/RC6: executor refused an unconfirmed mass mutation — re-stage WITH confirm_mass and ask the owner
        // to confirm the scale (showing the exact count). Nothing was written. This is the injection backstop:
        // even if the planner was talked into a catalog-wide change, it cannot execute without this 2nd confirm.
        if (result.requires_mass_confirm) {
          const massPending = { ...parsedPending, payload: { ...(parsedPending.payload as Record<string, unknown>), confirm_mass: true } }
          const { error: massStageErr } = await supabase.from('aria_conversations').update({
            pending_action: massPending,
            pending_action_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          }).eq('id', conversationId)
          // WALL 6 — THIS IS THE INJECTION BACKSTOP'S OWN WRITE. If it is rejected, the owner is
          // asked to "reply confirm" against a re-stage that was never stored, and the second
          // confirmation the mass-mutation gate depends on can never arrive.
          if (massStageErr) console.error('[aria/ask] mass-confirm re-stage FAILED:', massStageErr.message)
          const massText = `⚠️ ${result.error ?? `This affects ${result.affected_preview} items.`} Reply "confirm" to proceed.`
          let massConvId = conversationId
          // S9 PHASE 6 (#7) — STILL NON-FATAL, NO LONGER SILENT. If this throws, the turn is not
          // saved and the id returned below points at a conversation that may not exist — the owner
          // loses the exchange with no trace anywhere. S2B found live data loss in exactly this
          // area. Answering is still the right thing to do; saying nothing about it was not.
          try { massConvId = await upsertConversation(bid, userId, conversationId, message, massText, 'action_request') }
          catch (e) { console.error('[aria/ask] mass-confirm conversation NOT saved:', (e as Error).message) }
          return makeTurnResult('pending_action', { response: massText, conversation_id: massConvId ?? conversationId, intent: 'action_request', action: { action: 'mass_confirm', affected: result.affected_preview }, cost_usd_cents: 0 })
        }

        const { error: clearErr } = await supabase.from('aria_conversations').update({
          pending_action: null, pending_action_expires_at: null,
        }).eq('id', conversationId)
        // WALL 6 — the action has ALREADY EXECUTED at this point. A failed clear leaves the
        // pending_action live, so the next "yes" re-runs a write that already happened.
        if (clearErr) console.error('[aria/ask] pending_action clear FAILED after execution:', clearErr.message)

        // If action failed — return plain error, no council
        if (!result.ok) {
          const errText = `Action failed: ${result.error ?? 'Unknown error'}`
          let failConvId = conversationId
          try { failConvId = await upsertConversation(bid, userId, conversationId, message, errText, 'action_executed') } catch (e) { console.error('[silent-catch]', e) }
          return makeTurnResult('pending_action', {
            response: errText,
            conversation_id: failConvId ?? conversationId,
            intent: 'action_executed',
            action: { type: 'execution_result', ...result },
            cost_usd_cents: 0,
          })
        }

        // Build grounded confirmation from the actual action result.
        // Council may still run for follow-up blocks/suggestions but must NEVER override this text.
        const _ap = parsedPending.payload as Record<string, unknown>
        const _rollback = result.rollback_available ? ' You can undo this within 1 hour.' : ''
        const confirmText = (() => {
          switch (parsedPending.type) {
            case 'update_promotion': {
              const v = (_ap.discount_percent ?? _ap.discount_amount ?? _ap.bundle_price) as number | undefined
              const unit = _ap.discount_amount != null ? '$' : _ap.bundle_price != null ? ' bundle $' : '%'
              return v != null ? `Done — updated that promotion to ${unit === '%' ? v + '% off' : unit.trim() + v}.${_rollback}` : `Done — promotion updated.${_rollback}`
            }
            case 'create_promotion':
            case 'apply_category_discount': {
              const promoName = (typeof _ap.name === 'string' && _ap.name) || parsedPending.title
              const pct = parsedPending.type === 'apply_category_discount'
                ? (_ap.discount_percent as number | undefined)
                : (_ap.discount_amount as number | undefined)
              const catName = (typeof _ap.category_name === 'string' && _ap.category_name)
                || (typeof _ap.category === 'string' && _ap.category) || ''
              const activeDays = _ap.active_days as number[] | undefined
              const dayStr = activeDays && activeDays.length > 0 && activeDays.length < 7
                ? ' on ' + activeDays.map((d: number) => (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])[d - 1] ?? String(d)).join('/')
                : ''
              let msg = `Done — **${promoName}** is live`
              if (pct != null) msg += ` (${pct}% off`
              if (catName) msg += ` all ${catName}`
              if (pct != null) msg += ')'
              return msg + dayStr + '.' + _rollback
            }
            case 'bulk_price_update': {
              const scope = (typeof _ap.category === 'string' && _ap.category)
                || (typeof _ap.brand === 'string' && _ap.brand) || 'all products'
              return `Done — prices updated for ${result.affected_count} ${scope} product${result.affected_count !== 1 ? 's' : ''}.${_rollback}`
            }
            case 'adjust_stock':
              return `Done — stock adjusted for ${result.affected_count} product${result.affected_count !== 1 ? 's' : ''}.${_rollback}`
            case 'mark_products':
              return `Done — ${result.affected_count} product${result.affected_count !== 1 ? 's' : ''} updated (${String(_ap.field)} → ${String(_ap.value)}).${_rollback}`
            case 'set_low_stock_threshold':
              return `Done — low stock threshold set to ${String(_ap.threshold)} for ${result.affected_count} product${result.affected_count !== 1 ? 's' : ''}.${_rollback}`
            case 'create_roster':
              return `Done — draft roster **${String(_ap.name)}** created for week starting ${String(_ap.week_start)}. Review and publish from Staff.`
            case 'create_invoice':
              return `Done — draft invoice created for **${String(_ap.customer_name)}**. Review and send from Invoices.`
            case 'create_agent':
              return `Done \u2014 agent **${String(_ap.name)}** is ready. Mention it with @${String(_ap.name).toLowerCase().replace(/\s+/g, '-')} in any conversation, or find it in the skill picker.`
            case 'approve_po_draft': {
              const totalDollars = (Number(_ap.total_cost_cents ?? 0) / 100).toFixed(2)
              const itemCount = Number(_ap.items_count ?? result.affected_count)
              return `Done — draft PO approved. **$${totalDollars}** across ${itemCount} item${itemCount !== 1 ? 's' : ''}. Go to **Inventory → Buying** to review or send to your supplier.`
            }
            default:
              return `Done — ${parsedPending.title}: ${result.affected_count} item${result.affected_count !== 1 ? 's' : ''} updated.${_rollback}`
          }
        })()

        // RC3: never hide a partial failure behind a clean "Done".
        const confirmTextFinal = result.warning ? `${confirmText}\n\n⚠️ ${result.warning}` : confirmText
        // Council provides follow-up blocks/suggestions only — responseText is always confirmText
        let postCouncil: CouncilOutput | null = null
        try {
          const bizCtxForAction = await getBusinessContext(bid)
          postCouncil = await runAriaCouncil(bizCtxForAction + '\n\nRECENT_ACTION: ' + confirmText, bid, 'ask_aria')
        } catch (e) {
          console.error('[aria/ask] post-action council failed (non-fatal):', (e as Error).message)
        }
        const responseText = confirmTextFinal
        let savedConvId = conversationId
        try {
          savedConvId = await upsertConversation(bid, userId, conversationId, message, responseText, 'action_executed')
        } catch (e) {
          console.error('[aria/ask] upsertConversation failed (action_executed):', (e as Error).message)
        }
        return makeTurnResult('pending_action', {
          response: responseText,
          conversation_id: savedConvId ?? conversationId,
          intent: 'action_executed',
          action: { type: 'execution_result', ...result },
          blocks: postCouncil?.ask_blocks ?? [{ type: 'lead', content: responseText }],
          followups: postCouncil?.ask_followups ?? [],
          used_council: !!postCouncil,
          cost_usd_cents: 0,
        })
      }
    }
  }

  // Nothing in this lane claimed the turn — DECLINE, and the spine offers the next
  // candidate. This is the `fall through` the original expressed by simply running on.
  return null
}
