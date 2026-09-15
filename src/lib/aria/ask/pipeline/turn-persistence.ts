/**
 * M17 · BRAIN-1 PHASE 3 — THE HELPERS EVERY LANE SHARES, MOVED OUT OF THE ROUTE.
 *
 * ⚠️ MOVED, NOT REWRITTEN. Every function below is byte-identical to the copy that lived in
 * `src/app/api/aria/ask/route.ts`, minus the module-level `const` keyword changes forced by the new
 * file (there are none — they were already top-level functions). The comments came with them,
 * including the ones recording S1's supersede-never-delete rule, S3's provenance carrier and S9's
 * "non-fatal is not silent" incidents, because those are the reasons the code is shaped this way.
 *
 * They had to move: a strategy cannot import from `route.ts` — the route imports the strategies.
 * Leaving them behind would have meant a second copy, which is failure pattern #4.
 *
 * ⚠️ NOTHING IN THIS FILE CONSTRUCTS A RESPONSE. `scripts/ask-one-exit-guard.ts` reads it whole and
 * fails the push on one.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ariaChatWithProvider } from '@/lib/ai-router'
import {
  supersedeLastAssistant, supersedeFrom, liveIndexToAbsolute, type ThreadMessage,
} from '@/lib/aria/conversation-branch'
import {
  buildTitlePrompt, sanitiseTitle, fallbackTitle, shouldGenerateTitle,
} from '@/lib/aria/thread-title'

/* ── route.ts:72–105 ──────────────────────────────────────────────────────────────────────── */

// ASK-ARIA-CONSOLIDATE-2 (RC3): give the action planner memory — the recent turns + the LAST promotion created
// in this conversation — so an edit ("actually make it 15%") resolves to update_promotion on the existing row
// instead of creating a duplicate or misfiring to a bulk price change.
export async function buildPlanContext(
  bid: string,
  conversationId: string | null,
  clientMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<import('@/lib/aria/ask/action-planner').PlanContext> {
  let recentTurns: string[] = []
  if (clientMessages.length > 0) {
    recentTurns = clientMessages.slice(-10).map(m => `${m.role === 'assistant' ? 'Aria' : 'Owner'}: ${String(m.content ?? '').slice(0, 400)}`)
  } else if (conversationId) {
    const { data, error } = await supabaseAdmin.from('aria_conversations').select('messages').eq('id', conversationId).eq('business_id', bid).maybeSingle()
    // WALL 6 — without history the planner cannot resolve "actually make it 15%" to the promotion
    // it edits, and would create a duplicate instead. Non-fatal, no longer silent.
    if (error) console.error('[aria/ask] plan-context history unavailable:', error.message)
    const msgs = Array.isArray((data as { messages?: Array<{ role: string; content: string }> } | null)?.messages) ? (data as { messages: Array<{ role: string; content: string }> }).messages : []
    recentTurns = msgs.slice(-10).map(m => `${m.role === 'assistant' ? 'Aria' : 'Owner'}: ${String(m.content ?? '').slice(0, 400)}`)
  }
  let lastPromotion: import('@/lib/aria/ask/action-planner').PlanContext['lastPromotion'] = null
  if (conversationId) {
    const { data: logRow, error: logErr } = await supabaseAdmin.from('aria_action_log')
      .select('entity_ids, action_type, executed_at')
      .eq('business_id', bid).eq('conversation_id', conversationId)
      .in('action_type', ['create_promotion', 'apply_category_discount', 'update_promotion'])
      .order('executed_at', { ascending: false }).limit(1).maybeSingle()
    // WALL 6 — a lost action log means lastPromotion stays null and an edit misfires as a create.
    if (logErr) console.error('[aria/ask] last-promotion lookup failed:', logErr.message)
    const pid = (logRow?.entity_ids as string[] | undefined)?.[0]
    if (pid) {
      const { data: promo, error: promoErr } = await supabaseAdmin.from('pos_promotions')
        .select('id, name, promotion_type, discount_percent, discount_amount, bundle_price')
        .eq('id', pid).eq('business_id', bid).maybeSingle()
      if (promoErr) console.error('[aria/ask] promotion lookup failed:', promoErr.message)
      if (promo) lastPromotion = { id: promo.id as string, name: promo.name as string, promotion_type: promo.promotion_type as string, value: Number(promo.discount_percent ?? promo.discount_amount ?? promo.bundle_price) || null }
    }
  }
  return { recentTurns, lastPromotion }
}

/* ── route.ts:107–121 ─────────────────────────────────────────────────────────────────────── */
// BUGFIX-ASKARIA-THREADING: the dashboard client sends only {message, conversation_id} (no messages array), so
// history for the answer call must be REHYDRATED server-side from the conversation row. Returns the last ~10
// user/assistant turns of THIS conversation (or the client-sent messages if a future client provides them).
export async function loadAnswerHistory(
  bid: string,
  conversationId: string | null,
  clientMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (clientMessages.length > 0) return clientMessages.slice(-10)
  if (!conversationId) return []
  const { data, error } = await supabaseAdmin.from('aria_conversations').select('messages').eq('id', conversationId).eq('business_id', bid).maybeSingle()
  // WALL 6 — BUGFIX-ASKARIA-THREADING rehydrates this thread's history here. Losing it silently
  // is how a follow-up loses its referent and the answer reads as a non-sequitur.
  if (error) console.error('[aria/ask] answer history unavailable:', error.message)
  const msgs = Array.isArray((data as { messages?: Array<{ role: string; content: string }> } | null)?.messages) ? (data as { messages: Array<{ role: string; content: string }> }).messages : []
  return msgs.filter(m => m.role === 'user' || m.role === 'assistant').slice(-10).map(m => ({ role: m.role as 'user' | 'assistant', content: String(m.content ?? '') }))
}

/* ── route.ts:123–149 ─────────────────────────────────────────────────────────────────────── */
// which resolves the tenant through resolveOwnerBusinessId (the ONE canonical resolver, with the
// stale/foreign active-row re-validation the 16 inline copies never had). Ask Aria was the
// biggest remaining off-rail resolver.

export function extractAction(text: string): Record<string, unknown> | null {
  const match = text.match(/<json>([\s\S]*?)<\/json>/)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
}

export function extractBlocks(text: string): import('@/lib/aria/ask-types').AskBlock[] | null {
  const match = text.match(/<json_blocks>([\s\S]*?)<\/json_blocks>/i)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    return Array.isArray(parsed) ? parsed : null
  } catch { return null }
}

export function stripBlocks(text: string): string {
  return text.replace(/<json_blocks>[\s\S]*?<\/json_blocks>/gi, '').trim()
}

export function stripAction(text: string): string {
  return text.replace(/<json>[\s\S]*?<\/json>/g, '').trim()
}

/* ── route.ts:150–292 ─────────────────────────────────────────────────────────────────────── */
export async function upsertConversation(
  businessId: string,
  userId: string,
  conversationId: string | null,
  userMsg: string,
  assistantMsg: string,
  intentType: string,
  downloads?: Array<{ filename: string; download_url: string; rows: number; format: string }>,
  /**
   * S1 PHASE 1 — the owner pressed Stop, so this assistant turn is a PARTIAL answer.
   * It is stored, not discarded: a half-answer the owner watched arrive is real, and silently
   * dropping it would lose work they saw. It is marked so nothing downstream — the UI, the
   * history route, a later regenerate — can mistake it for a finished answer.
   */
  incomplete?: boolean,
  /**
   * S1 PHASES 2 & 3 — how this turn joins the thread.
   *
   *   'append'    the normal case: a new question and its answer.
   *   'regenerate' re-running the last answer. The previous answer is SUPERSEDED, not overwritten,
   *               and no duplicate copy of the question is added.
   *   'edit'      an earlier question was changed. That message and everything after it are
   *               superseded, then the new question and answer are appended.
   *
   * Nothing is ever spliced out of the array. See lib/aria/conversation-branch.ts.
   */
  branch?: { mode: 'append' | 'regenerate' | 'edit'; editLiveIndex?: number },
  /**
   * S3 PHASE 1 — the turn's provenance, STORED WITH THE MESSAGE.
   *
   * This is the link the chain was missing. Anchors were computed per turn and thrown away at the
   * end of it, so a reloaded thread could never show a tier no matter how good the renderer was:
   * the ground truth for that turn no longer existed anywhere. Persisting it here is what makes
   * provenance survive a reload and a search hit rather than living only in the live response.
   *
   * Omitted on every path that computed no anchors — the field is absent, not an empty object, so
   * "we never captured this" and "we captured nothing" stay distinguishable in the JSONB.
   */
  provenance?: { anchors: number[]; anchorLabels?: Record<string, string> },
): Promise<string> {
  console.log('[upsertConversation] called for biz:', businessId, 'user:', userId, 'existing:', conversationId)
  const pair: ThreadMessage[] = [
    { role: 'user', content: userMsg, ts: new Date().toISOString() },
    {
      role: 'assistant', content: assistantMsg, ts: new Date().toISOString(), downloads: downloads ?? [],
      ...(incomplete ? { incomplete: true, stopped_by: 'user' } : {}),
      ...(provenance && provenance.anchors.length > 0 ? { provenance } : {}),
    },
  ]

  if (conversationId) {
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('aria_conversations')
      .select('messages, message_count')
      .eq('id', conversationId)
      .eq('business_id', businessId)
      .maybeSingle()
    // WALL 6 — a failed READ here falls through to the INSERT branch below and creates a SECOND
    // conversation instead of appending to the existing one. Silent until now.
    if (existingErr) console.error('[upsertConversation] existing-thread read failed:', existingErr.message)

    if (existing) {
      const msgs = (Array.isArray(existing.messages) ? existing.messages : []) as ThreadMessage[]
      const mode = branch?.mode ?? 'append'
      const stamp = new Date().toISOString()
      const newAssistantId = 'a:' + stamp

      // SUPERSEDE, NEVER DELETE. The array only ever grows; renderPath() decides what is shown.
      let base: ThreadMessage[] = msgs
      let toAppend = pair
      if (mode === 'regenerate') {
        base = supersedeLastAssistant(msgs, newAssistantId, stamp).messages
        // no second copy of the question — the owner asked once
        toAppend = [{ ...pair[1]!, id: newAssistantId }]
      } else if (mode === 'edit') {
        const abs = liveIndexToAbsolute(msgs, branch?.editLiveIndex ?? -1)
        if (abs >= 0) base = supersedeFrom(msgs, abs, newAssistantId, stamp).messages
        toAppend = [
          { ...pair[0]!, id: 'u:' + stamp, edited_from: String(abs) },
          { ...pair[1]!, id: newAssistantId },
        ]
      }

      const { error: updateErr } = await supabaseAdmin.from('aria_conversations').update({
        messages: [...base, ...toAppend],
        message_count: (Number(existing.message_count) || 0) + toAppend.length,
        last_message_at: new Date().toISOString(),
        last_intent: intentType,
      }).eq('id', conversationId)
      if (updateErr) {
        console.error('[upsertConversation] UPDATE FAILED:', updateErr.message)
        throw new Error('Failed to update conversation: ' + updateErr.message)
      }
      console.log('[upsertConversation] UPDATED:', conversationId)
      return conversationId
    }
  }

  /**
   * S1 PHASE 6 — THE TITLE IS WRITTEN EXACTLY ONCE, HERE, AT CREATION.
   *
   * There is no title UPDATE anywhere in this route, which is what guarantees both sprint rules
   * without needing a `title_edited` column: one call per thread ever, and a rename can never be
   * clobbered by code that never writes the field again.
   *
   * Generation is best-effort and time-boxed. A thread with a crude title is fine; a thread whose
   * first answer was delayed by titling is not, so a failure falls straight back to the question.
   */
  let title = fallbackTitle(userMsg)
  if (shouldGenerateTitle({ isNewConversation: true, question: userMsg })) {
    try {
      const generated = await Promise.race([
        ariaChatWithProvider('insight', buildTitlePrompt(userMsg, assistantMsg), 24, {
          businessId, agentKey: 'thread_title',
        }).then(r => r.text),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error('title timeout')), 6_000)),
      ])
      title = sanitiseTitle(generated, userMsg)
    } catch (e) {
      console.warn('[thread-title] falling back to the question:', (e as Error).message)
    }
  }

  const { data: created, error: insertErr } = await supabaseAdmin.from('aria_conversations').insert({
    business_id: businessId,
    user_id: userId,
    title,
    messages: pair,
    message_count: 2,
    last_intent: intentType,
    last_message_at: new Date().toISOString(),
  }).select('id').single()

  if (insertErr) {
    console.error('[upsertConversation] INSERT FAILED:', insertErr.message, 'code:', insertErr.code, 'details:', insertErr.details)
    throw new Error('Failed to save conversation: ' + insertErr.message)
  }
  console.log('[upsertConversation] INSERTED:', created?.id)
  return (created as { id: string }).id
}
