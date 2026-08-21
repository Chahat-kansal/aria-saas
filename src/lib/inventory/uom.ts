/**
 * MS11 PHASES 4-6 — THE BASE-UNIT MODEL (INV-UOM-1).
 *
 * Stock, cost and recipes are stored in BASE UNITS. A purchase pack is a CONVERSION applied at
 * the boundary (receiving a PO, displaying "2 cases"), never a stored alternative truth. Built
 * NOW, while there is no real pack data anywhere (MCP-verified 2026-08-19: every pack column is
 * its default), so the model never needs a data migration — only adoption.
 *
 * ── COLUMN ROLES (chosen from what exists — no new columns) ─────────────────────────────────
 *   pos_products.unit              THE BASE UNIT. Populated (106 rows, 'each'). stock_quantity,
 *                                  pos_outlet_inventory.items_on_hand, recipe quantities and all
 *                                  cost-per-unit figures are in THIS unit.
 *   pos_products.purchase_uom      The purchase pack's unit name ('case', 'carton', 'keg').
 *                                  Null today on all rows — which is why conversion REFUSES today.
 *   pos_products.purchase_uom_qty  Base units per purchase pack. THE ONLY LIVE CONVERSION FACTOR.
 *
 * ── TOMBSTONES (RULE 0 — columns stay, canonical code no longer reads them) ─────────────────
 *   pos_products.items_per_case     duplicate factor (default 1 on all rows). Was read by the
 *                                   replenishment agent's case rounding — migrated to
 *                                   packConversion() in MS11 phase 4.
 *   pos_products.case_quantity      duplicate factor written by CSV import mapping. Import
 *                                   writers are LISTED, not touched (decision table: import
 *                                   sites stay); nothing canonical reads it.
 *   pos_products.cases_in_stock     derived stock in pack units — stock is base units, always.
 *   pos_products.sell_uom           0 rows. The sell unit IS the base unit.
 *   pos_outlet_inventory.items_per_case + cases_on_hand + cases_reorder_* + cases_max_on_hand
 *                                   per-outlet duplicates of the same ideas.
 *   warehouse_uom                   parked table, 0 rows. Warehouse is out of scope.
 *
 * ── THE INVARIANT (phase 5) ─────────────────────────────────────────────────────────────────
 * A pack-size change affects FUTURE conversions only. applyPackSizeChange() returns the ONLY
 * fields such a change may write — the two pack columns — so a caller structurally cannot use
 * it to rewrite a stored stock or cost figure. The Shopfront/Thirsty Camel failure this
 * prevents: owner corrects items-per-case 12 -> 24 and every historical figure silently doubles.
 *
 * ── REFUSE, DON'T GUESS (phase 6) ───────────────────────────────────────────────────────────
 * A missing or ambiguous factor produces {ok:false, reason} naming the product and the missing
 * unit. Never a default of 1, never inferred from a product name, never a case treated as a unit.
 */

export interface ProductUnitInfo {
  id?: string
  name?: string | null
  unit?: string | null
  purchase_uom?: string | null
  // Supabase returns numeric columns as strings — accepted and validated here, never assumed.
  purchase_uom_qty?: number | string | null
}

export type PackConversion =
  | { ok: true; factor: number; pack_unit: string; base_unit: string }
  | { ok: false; reason: string }

export function packConversion(p: ProductUnitInfo): PackConversion {
  const who = (p.name ?? p.id ?? 'this product') as string
  const base = (p.unit ?? '').toString().trim()
  if (!base) {
    return { ok: false, reason: who + ': no base unit recorded (pos_products.unit is empty) — set the base unit before any pack conversion.' }
  }
  const packUnit = (p.purchase_uom ?? '').toString().trim()
  const qty = p.purchase_uom_qty == null || p.purchase_uom_qty === '' ? null : Number(p.purchase_uom_qty)
  if (!packUnit) {
    return { ok: false, reason: who + ': purchase pack has a quantity but no unit (purchase_uom is empty) — a conversion factor with no unit attached is ambiguous. Refusing to convert; set the purchase unit (e.g. "case").' }
  }
  if (qty == null || !Number.isFinite(qty) || qty <= 0) {
    return { ok: false, reason: who + ": purchase unit '" + packUnit + "' has no valid quantity (purchase_uom_qty is " + String(p.purchase_uom_qty ?? 'empty') + ") — refusing to convert. Never defaulted to 1; set base units per " + packUnit + '.' }
  }
  return { ok: true, factor: qty, pack_unit: packUnit, base_unit: base }
}

/** Purchase boundary: packs in -> base units stored. */
export function toBaseUnits(packQty: number, conv: PackConversion): { ok: true; base_qty: number } | { ok: false; reason: string } {
  if (!conv.ok) return conv
  if (!Number.isFinite(packQty) || packQty < 0) return { ok: false, reason: 'invalid pack quantity: ' + String(packQty) }
  return { ok: true, base_qty: packQty * conv.factor }
}

/** Display boundary: base units stored -> packs shown. Stored figures are never rewritten. */
export function fromBaseUnits(baseQty: number, conv: PackConversion): { ok: true; packs: number } | { ok: false; reason: string } {
  if (!conv.ok) return conv
  if (!Number.isFinite(baseQty) || baseQty < 0) return { ok: false, reason: 'invalid base quantity: ' + String(baseQty) }
  return { ok: true, packs: baseQty / conv.factor }
}

/**
 * MS12 PHASE 5 — THE IMPORT BOUNDARY. A CSV's "Units Per Case" / "Case Quantity" column is an
 * EXPLICIT pack declaration: the unit is 'case' (it is the column's own name), the quantity is
 * the cell. It converts to the canonical pair at the front door — it must never again land in
 * the tombstoned items_per_case/case_quantity columns, because an import path is exactly how a
 * dead column gets quietly repopulated.
 *
 * Refusals (MS11 phase-6 rule, applied at the front door): a non-positive/non-numeric value
 * refuses the ROW with a reason; two mapped pack columns that DISAGREE refuse as ambiguous —
 * never pick one, never default.
 */
export function importPackFields(caseQuantity: unknown, itemsPerCase: unknown):
  | { ok: true; patch: PackSizeChange | null }
  | { ok: false; reason: string } {
  const vals: number[] = []
  for (const raw of [caseQuantity, itemsPerCase]) {
    if (raw == null || raw === '') continue
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: 'pack size "' + String(raw) + '" is not a positive number — row refused, never defaulted' }
    vals.push(n)
  }
  if (vals.length === 0) return { ok: true, patch: null }
  if (vals.length === 2 && vals[0] !== vals[1]) {
    return { ok: false, reason: 'case_quantity (' + String(vals[0]) + ') and items_per_case (' + String(vals[1]) + ') disagree — ambiguous pack size, row refused' }
  }
  return { ok: true, patch: { purchase_uom: 'case', purchase_uom_qty: vals[0] } }
}

/**
 * MS11 PHASE 5 — the ONLY fields a pack-size change may write.
 *
 * The return type is the whole guarantee: a caller applying this patch cannot touch
 * stock_quantity, items_on_hand, cost_price, item_cost or anything else, because the patch
 * simply does not contain them. History is immutable to a pack-size correction BY CONSTRUCTION.
 */
export interface PackSizeChange { purchase_uom: string; purchase_uom_qty: number }

export function applyPackSizeChange(newPackUnit: unknown, newQty: unknown): { ok: true; patch: PackSizeChange } | { ok: false; reason: string } {
  const unit = String(newPackUnit ?? '').trim()
  const qty = Number(newQty)
  if (!unit) return { ok: false, reason: 'purchase unit required — a factor with no unit attached is exactly the ambiguity this model exists to prevent.' }
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'pack quantity must be a positive number — never guessed, never defaulted.' }
  return { ok: true, patch: { purchase_uom: unit, purchase_uom_qty: qty } }
}
