import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditAction =
  | 'modify_metadata'
  | 'modify_items'
  | 'void'
  | 'return'
  | 'refund'
  | 'comment'
  | 'attach_customer'
  | 'detach_customer'

export interface AuditPayload {
  sale_id: string
  business_id: string
  edited_by: string | null
  action: AuditAction
  field_changed?: string
  old_value?: unknown
  new_value?: unknown
  reason?: string
  client_info?: { ip?: string; user_agent?: string }
}

/**
 * Logs a sale modification to pos_sale_edits.
 * NEVER throws — audit failure must not block the action.
 */
export async function logSaleEdit(
  supabase: SupabaseClient,
  payload: AuditPayload
): Promise<void> {
  try {
    await supabase.from('pos_sale_edits').insert({
      sale_id: payload.sale_id,
      business_id: payload.business_id,
      edited_by: payload.edited_by,
      action: payload.action,
      field_changed: payload.field_changed ?? null,
      old_value: payload.old_value ?? null,
      new_value: payload.new_value ?? null,
      reason: payload.reason ?? null,
      client_info: payload.client_info ?? null,
    })
  } catch (err) {
    console.warn('[sale-audit] failed to log edit:', err)
  }
}
