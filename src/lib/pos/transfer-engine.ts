/**
 * Transfer Engine — pure functions for the 6-state workflow.
 * Sprint F: state validation, cost basis selection, variance computation.
 */

export type TransferStatus = 'draft' | 'requested' | 'approved' | 'in_transit' | 'received' | 'reconciled' | 'cancelled'

export interface TransferItem {
  product_id: string
  quantity_requested: number
  quantity_approved: number
  quantity_sent: number
  quantity_received: number
  unit_cost: number
}

export interface InventoryRow {
  outlet_id: string
  product_id: string
  items_on_hand: number
  item_cost: number | null
  last_item_cost: number | null
  last_received_at: string | null
}

// ── State machine ───────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  draft:      ['requested', 'cancelled'],
  requested:  ['approved', 'cancelled'],
  approved:   ['in_transit', 'cancelled'],
  in_transit: ['received', 'cancelled'],
  received:   ['reconciled'],
  reconciled: [],
  cancelled:  [],
}

export function canTransition(from: TransferStatus, to: TransferStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export function requiredPermissionForTransition(from: TransferStatus, to: TransferStatus): string | null {
  if (from === 'draft' && to === 'requested') return 'can_create_transfer'
  if (from === 'requested' && to === 'approved') return 'can_approve_transfer'
  if (from === 'approved' && to === 'in_transit') return 'can_create_transfer'
  if (from === 'in_transit' && to === 'received') return 'can_receive_transfer'
  if (from === 'received' && to === 'reconciled') return 'can_receive_transfer'
  if (to === 'cancelled') return 'can_create_transfer'
  return null
}

// ── Cost basis ──────────────────────────────────────────────────────────────

export type CostMethod = 'fifo' | 'lifo' | 'weighted_avg' | 'last_cost'

/**
 * Snapshot unit cost when an item is shipped. Since we only have a single
 * pos_outlet_inventory row per (product, outlet) (no batch tracking yet),
 * the available signals are item_cost (current weighted avg) and last_item_cost
 * (most recent purchase). FIFO and LIFO degrade to those without batch data.
 */
export function snapshotUnitCost(inv: InventoryRow | null, method: CostMethod): number {
  if (!inv) return 0
  const current = Number(inv.item_cost) || 0
  const last = Number(inv.last_item_cost) || 0
  switch (method) {
    case 'last_cost': return last || current
    case 'lifo':      return last || current   // newest cost first
    case 'fifo':      return current || last   // running avg approximates oldest cost
    case 'weighted_avg':
    default:          return current || last
  }
}

// ── Variance ────────────────────────────────────────────────────────────────

export interface VarianceLine {
  product_id: string
  quantity_sent: number
  quantity_received: number
  variance_units: number
  variance_cost: number
  pct_variance: number
}

export function computeVariance(items: TransferItem[]): { total_variance_units: number; total_variance_cost: number; lines: VarianceLine[] } {
  const lines: VarianceLine[] = []
  let totalUnits = 0
  let totalCost = 0
  for (const i of items) {
    const sent = Number(i.quantity_sent) || 0
    const received = Number(i.quantity_received) || 0
    const variance = received - sent
    const unitCost = Number(i.unit_cost) || 0
    const varCost = variance * unitCost
    const pct = sent > 0 ? (variance / sent) * 100 : 0
    lines.push({
      product_id: i.product_id,
      quantity_sent: sent,
      quantity_received: received,
      variance_units: variance,
      variance_cost: +varCost.toFixed(2),
      pct_variance: +pct.toFixed(2),
    })
    totalUnits += variance
    totalCost += varCost
  }
  return {
    total_variance_units: totalUnits,
    total_variance_cost: +totalCost.toFixed(2),
    lines,
  }
}
