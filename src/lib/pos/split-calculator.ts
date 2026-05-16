export type SplitMethod = 'even' | 'by_item' | 'by_amount' | 'by_percent'
export type TipType = 'percent' | 'amount'

export interface CartItem {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface SplitInput {
  person_label: string
  group_member_id?: string
  customer_id?: string
  amount?: number          // for by_amount
  percent?: number         // for by_percent
  item_ids?: string[]      // for by_item (sale_item_ids)
  tip_type?: TipType
  tip_value?: number
}

export interface CalculatedSplit {
  person_label: string
  group_member_id?: string
  customer_id?: string
  subtotal: number
  tax_amount: number
  tip_amount: number
  tip_type?: TipType
  tip_value?: number
  total_amount: number
  assigned_items?: Array<{ sale_item_id: string; quantity_assigned: number; amount_assigned: number }>
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100
}

export function calculateEvenSplit(
  saleSubtotal: number,
  saleTax: number,
  inputs: SplitInput[],
): CalculatedSplit[] {
  const count = inputs.length
  if (count === 0) return []
  const perSubtotal = roundCents(saleSubtotal / count)
  const perTax = roundCents(saleTax / count)
  const results: CalculatedSplit[] = inputs.map((inp, i) => {
    // Last person absorbs rounding remainder
    const sub = i === count - 1
      ? roundCents(saleSubtotal - perSubtotal * (count - 1))
      : perSubtotal
    const tax = i === count - 1
      ? roundCents(saleTax - perTax * (count - 1))
      : perTax
    const tipAmt = inp.tip_type ? addTipAmount(sub, inp.tip_type, inp.tip_value ?? 0) : 0
    return {
      person_label: inp.person_label,
      group_member_id: inp.group_member_id,
      customer_id: inp.customer_id,
      subtotal: sub,
      tax_amount: tax,
      tip_amount: tipAmt,
      tip_type: inp.tip_type,
      tip_value: inp.tip_value,
      total_amount: roundCents(sub + tax + tipAmt),
    }
  })
  return results
}

export function calculateByItemSplit(
  cart: CartItem[],
  saleTax: number,
  inputs: SplitInput[],
): CalculatedSplit[] {
  const cartMap = Object.fromEntries(cart.map(c => [c.id, c]))
  const totalSubtotal = cart.reduce((s, c) => s + c.line_total, 0)
  return inputs.map(inp => {
    const items = (inp.item_ids ?? []).map(id => cartMap[id]).filter(Boolean)
    const sub = roundCents(items.reduce((s, item) => s + item.line_total, 0))
    const taxPortion = totalSubtotal > 0 ? roundCents((sub / totalSubtotal) * saleTax) : 0
    const tipAmt = inp.tip_type ? addTipAmount(sub, inp.tip_type, inp.tip_value ?? 0) : 0
    return {
      person_label: inp.person_label,
      group_member_id: inp.group_member_id,
      customer_id: inp.customer_id,
      subtotal: sub,
      tax_amount: taxPortion,
      tip_amount: tipAmt,
      tip_type: inp.tip_type,
      tip_value: inp.tip_value,
      total_amount: roundCents(sub + taxPortion + tipAmt),
      assigned_items: items.map(item => ({
        sale_item_id: item.id,
        quantity_assigned: item.quantity,
        amount_assigned: item.line_total,
      })),
    }
  })
}

export function calculateByAmountSplit(
  saleSubtotal: number,
  saleTax: number,
  inputs: SplitInput[],
): CalculatedSplit[] {
  return inputs.map(inp => {
    const sub = roundCents(inp.amount ?? 0)
    const taxPortion = saleSubtotal > 0 ? roundCents((sub / saleSubtotal) * saleTax) : 0
    const tipAmt = inp.tip_type ? addTipAmount(sub, inp.tip_type, inp.tip_value ?? 0) : 0
    return {
      person_label: inp.person_label,
      group_member_id: inp.group_member_id,
      customer_id: inp.customer_id,
      subtotal: sub,
      tax_amount: taxPortion,
      tip_amount: tipAmt,
      tip_type: inp.tip_type,
      tip_value: inp.tip_value,
      total_amount: roundCents(sub + taxPortion + tipAmt),
    }
  })
}

export function calculateByPercentSplit(
  saleSubtotal: number,
  saleTax: number,
  inputs: SplitInput[],
): CalculatedSplit[] {
  return inputs.map((inp, i) => {
    const pct = (inp.percent ?? 0) / 100
    const sub = roundCents(saleSubtotal * pct)
    const tax = roundCents(saleTax * pct)
    const tipAmt = inp.tip_type ? addTipAmount(sub, inp.tip_type, inp.tip_value ?? 0) : 0
    return {
      person_label: inp.person_label,
      group_member_id: inp.group_member_id,
      customer_id: inp.customer_id,
      subtotal: sub,
      tax_amount: tax,
      tip_amount: tipAmt,
      tip_type: inp.tip_type,
      tip_value: inp.tip_value,
      total_amount: roundCents(sub + tax + tipAmt),
    }
  })
}

export function addTipAmount(subtotal: number, tipType: TipType, tipValue: number): number {
  if (tipType === 'percent') return roundCents(subtotal * tipValue / 100)
  return roundCents(tipValue)
}