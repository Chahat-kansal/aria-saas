interface InsightRoutable {
  category?: string | null
  source?: string | null
  payload?: {
    suggested_action?: {
      type?: string
      payload?: Record<string, unknown>
    }
    action_payload?: Record<string, unknown>
    action_type?: string
    evidence?: unknown[]
  } | null
}

/**
 * Resolve an Aria insight to the most relevant in-app URL.
 * Tries (in order):
 *  1. A specific entity ID in the payload (product_id, customer_id, etc.)
 *  2. The action_type (navigate/restock/investigation)
 *  3. The category bucket
 *  4. A safe fallback (dashboard)
 */
export function routeForInsight(insight: InsightRoutable): string {
  const payload = insight.payload ?? {}
  const actionPayload = (payload.suggested_action?.payload ?? payload.action_payload ?? {}) as Record<string, unknown>
  const actionType = payload.suggested_action?.type ?? payload.action_type ?? null

  // 1. Specific entity in payload — go straight there.
  if (typeof actionPayload.product_id === 'string') return `/pos/products/${actionPayload.product_id}`
  if (typeof actionPayload.customer_id === 'string') return `/pos/customers/${actionPayload.customer_id}`
  if (typeof actionPayload.sale_id === 'string') return `/pos/sales-history?sale_id=${actionPayload.sale_id}`
  if (typeof actionPayload.promotion_id === 'string') return `/pos/promotions/${actionPayload.promotion_id}`
  if (typeof actionPayload.order_id === 'string') return `/pos/orders/${actionPayload.order_id}`
  if (typeof actionPayload.transfer_id === 'string') return `/pos/transfers/${actionPayload.transfer_id}`

  // 2. action_type tells us the kind of thing the user should do.
  if (actionType === 'restock') return '/pos/products?filter=low_stock'
  if (actionType === 'investigation') {
    if (insight.category === 'sales') return '/pos/returns'
    if (insight.category === 'inventory') return '/pos/products'
    if (insight.category === 'customers') return '/pos/customers'
  }
  if (actionType === 'navigate') {
    const section = actionPayload.section
    if (section === 'business_settings') return '/dashboard/settings'
    if (section === 'tax') return '/pos/settings/tax-codes'
    if (section === 'roles') return '/pos/settings/roles'
  }

  // 3. Category bucket fallback.
  switch (insight.category) {
    case 'inventory': return '/pos/products'
    case 'sales': return '/pos/sales-history'
    case 'pricing': return '/pos/products'
    case 'customers': return '/pos/customers'
    case 'staff': return '/pos/audit-log'
    case 'promotions': return '/pos/promotions'
    case 'orders': return '/pos/orders'
    case 'receipts': return '/pos/sales-history'
    case 'cashflow': return '/pos/manage-cash'
    case 'expiry': return '/pos/products'
    case 'compliance': return '/dashboard/settings'
    default: return '/dashboard'
  }
}
