import { SupabaseClient } from '@supabase/supabase-js'

export type PermissionFlag =
  | 'can_apply_discount' | 'can_void' | 'can_refund' | 'can_close_register'
  | 'can_open_register' | 'can_override_price' | 'can_apply_manual_price'
  | 'can_reopen_sale' | 'can_edit_products' | 'can_view_cost_price'
  | 'can_manage_staff' | 'can_issue_store_credit' | 'can_view_other_cashier_sales'
  | 'can_access_cash_management' | 'can_do_stocktake' | 'can_receive_purchase_orders'
  | 'can_create_purchase_orders' | 'can_manage_customers' | 'can_view_customer_contact'
  | 'can_send_sms' | 'can_access_timesheets' | 'can_edit_own_timesheet'
  | 'can_approve_timesheets' | 'can_access_waste_log' | 'can_access_kds'
  | 'can_print_labels' | 'can_export_data' | 'can_view_reports'
  | 'can_create_transfer' | 'can_approve_transfer' | 'can_receive_transfer'

export interface PosPermissions {
  can_apply_discount?: boolean
  max_discount_pct?: number
  can_void?: boolean
  can_refund?: boolean
  max_refund_amount?: number
  can_close_register?: boolean
  can_open_register?: boolean
  can_override_price?: boolean
  can_apply_manual_price?: boolean
  can_reopen_sale?: boolean
  can_edit_products?: boolean
  can_view_cost_price?: boolean
  can_manage_staff?: boolean
  can_issue_store_credit?: boolean
  can_view_other_cashier_sales?: boolean
  can_access_cash_management?: boolean
  can_do_stocktake?: boolean
  can_receive_purchase_orders?: boolean
  can_create_purchase_orders?: boolean
  can_manage_customers?: boolean
  can_view_customer_contact?: boolean
  can_send_sms?: boolean
  can_access_timesheets?: boolean
  can_edit_own_timesheet?: boolean
  can_approve_timesheets?: boolean
  can_access_waste_log?: boolean
  can_access_kds?: boolean
  can_print_labels?: boolean
  can_export_data?: boolean
  can_view_reports?: boolean
  can_create_transfer?: boolean
  can_approve_transfer?: boolean
  can_receive_transfer?: boolean
}

export interface PosUserRow {
  id: string
  name: string
  role: string
  permissions: PosPermissions
}

export const ROLE_PERMISSION_DEFAULTS: Record<string, PosPermissions> = {
  owner: {
    can_apply_discount: true, max_discount_pct: 100, can_void: true, can_refund: true,
    max_refund_amount: 999999, can_close_register: true, can_open_register: true,
    can_override_price: true, can_apply_manual_price: true, can_reopen_sale: true,
    can_edit_products: true, can_view_cost_price: true, can_manage_staff: true,
    can_issue_store_credit: true, can_view_other_cashier_sales: true,
    can_access_cash_management: true, can_do_stocktake: true,
    can_receive_purchase_orders: true, can_create_purchase_orders: true,
    can_manage_customers: true, can_view_customer_contact: true, can_send_sms: true,
    can_access_timesheets: true, can_edit_own_timesheet: true, can_approve_timesheets: true,
    can_access_waste_log: true, can_access_kds: true, can_print_labels: true,
    can_export_data: true, can_view_reports: true,
    can_create_transfer: true, can_approve_transfer: true, can_receive_transfer: true,
  },
  admin: {
    can_apply_discount: true, max_discount_pct: 100, can_void: true, can_refund: true,
    max_refund_amount: 999999, can_close_register: true, can_open_register: true,
    can_override_price: true, can_apply_manual_price: true, can_reopen_sale: true,
    can_edit_products: true, can_view_cost_price: true, can_manage_staff: false,
    can_issue_store_credit: true, can_view_other_cashier_sales: true,
    can_access_cash_management: true, can_do_stocktake: true,
    can_receive_purchase_orders: true, can_create_purchase_orders: true,
    can_manage_customers: true, can_view_customer_contact: true, can_send_sms: true,
    can_access_timesheets: true, can_edit_own_timesheet: true, can_approve_timesheets: true,
    can_access_waste_log: true, can_access_kds: true, can_print_labels: true,
    can_export_data: true, can_view_reports: true,
    can_create_transfer: true, can_approve_transfer: true, can_receive_transfer: true,
  },
  manager: {
    can_apply_discount: true, max_discount_pct: 50, can_void: true, can_refund: true,
    max_refund_amount: 500, can_close_register: true, can_open_register: true,
    can_override_price: true, can_apply_manual_price: true, can_reopen_sale: true,
    can_edit_products: true, can_view_cost_price: true, can_manage_staff: false,
    can_issue_store_credit: true, can_view_other_cashier_sales: true,
    can_access_cash_management: true, can_do_stocktake: true,
    can_receive_purchase_orders: true, can_create_purchase_orders: false,
    can_manage_customers: true, can_view_customer_contact: true, can_send_sms: true,
    can_access_timesheets: true, can_edit_own_timesheet: true, can_approve_timesheets: true,
    can_access_waste_log: true, can_access_kds: true, can_print_labels: true,
    can_export_data: true, can_view_reports: true,
    can_create_transfer: true, can_approve_transfer: true, can_receive_transfer: true,
  },
  supervisor: {
    can_apply_discount: true, max_discount_pct: 25, can_void: true, can_refund: true,
    max_refund_amount: 50, can_close_register: true, can_open_register: true,
    can_override_price: false, can_apply_manual_price: false, can_reopen_sale: false,
    can_edit_products: false, can_view_cost_price: false, can_manage_staff: false,
    can_issue_store_credit: false, can_view_other_cashier_sales: true,
    can_access_cash_management: true, can_do_stocktake: true,
    can_receive_purchase_orders: false, can_create_purchase_orders: false,
    can_manage_customers: true, can_view_customer_contact: true, can_send_sms: false,
    can_access_timesheets: true, can_edit_own_timesheet: true, can_approve_timesheets: false,
    can_access_waste_log: true, can_access_kds: true, can_print_labels: true,
    can_export_data: false, can_view_reports: true,
    can_create_transfer: true, can_approve_transfer: false, can_receive_transfer: true,
  },
  cashier: {
    can_apply_discount: true, max_discount_pct: 10, can_void: false, can_refund: false,
    max_refund_amount: 0, can_close_register: false, can_open_register: false,
    can_override_price: false, can_apply_manual_price: false, can_reopen_sale: false,
    can_edit_products: false, can_view_cost_price: false, can_manage_staff: false,
    can_issue_store_credit: false, can_view_other_cashier_sales: false,
    can_access_cash_management: false, can_do_stocktake: false,
    can_receive_purchase_orders: false, can_create_purchase_orders: false,
    can_manage_customers: false, can_view_customer_contact: false, can_send_sms: false,
    can_access_timesheets: false, can_edit_own_timesheet: true, can_approve_timesheets: false,
    can_access_waste_log: false, can_access_kds: true, can_print_labels: true,
    can_export_data: false, can_view_reports: false,
    can_create_transfer: false, can_approve_transfer: false, can_receive_transfer: false,
  },
}

export async function checkPermissionForOutlet(
  posUser: { id: string; role: string; permissions: Record<string, unknown> },
  flag: string,
  outletId: string | null,
  supabase: SupabaseClient
): Promise<boolean> {
  const base = (posUser.permissions ?? {})[flag] ?? ROLE_PERMISSION_DEFAULTS[posUser.role]?.[flag as keyof typeof ROLE_PERMISSION_DEFAULTS[string]] ?? false
  if (!outletId) return Boolean(base)
  const { data: overlay } = await supabase.from('pos_outlet_role_permissions')
    .select('permission_overlay').eq('outlet_id', outletId).eq('pos_user_id', posUser.id).maybeSingle()
  if (overlay?.permission_overlay && flag in (overlay.permission_overlay as Record<string, unknown>)) {
    return Boolean((overlay.permission_overlay as Record<string, unknown>)[flag])
  }
  return Boolean(base)
}

export async function getPosUser(
  supabase: SupabaseClient,
  pos_user_id: string,
  business_id: string,
): Promise<PosUserRow | null> {
  const { data } = await supabase
    .from('pos_users')
    .select('id, name, role, permissions')
    .eq('id', pos_user_id)
    .eq('business_id', business_id)
    .eq('is_active', true)
    .maybeSingle()
  return data ?? null
}

export function resolvePermissions(user: PosUserRow): PosPermissions {
  const roleDefaults = ROLE_PERMISSION_DEFAULTS[user.role] ?? ROLE_PERMISSION_DEFAULTS.cashier
  return { ...roleDefaults, ...(user.permissions ?? {}) }
}

export function checkFlag(perms: PosPermissions, flag: PermissionFlag): boolean {
  return !!(perms as Record<string, unknown>)[flag]
}

export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: {
    business_id: string
    action: string
    pos_user_id?: string | null
    manager_approved_by?: string | null
    performed_by?: string | null
    sale_id?: string | null
    item_id?: string | null
    amount?: number | null
    reason_code?: string | null
    reason_note?: string | null
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  try {
    await supabase.from('pos_audit_log').insert({
      business_id: entry.business_id,
      action: entry.action,
      pos_user_id: entry.pos_user_id ?? null,
      manager_approved_by: entry.manager_approved_by ?? null,
      performed_by: entry.performed_by ?? null,
      sale_id: entry.sale_id ?? null,
      item_id: entry.item_id ?? null,
      amount: entry.amount ?? null,
      reason_code: entry.reason_code ?? null,
      reason_note: entry.reason_note ?? null,
      metadata: entry.metadata ?? {},
    })
  } catch { /* non-fatal */ }
}