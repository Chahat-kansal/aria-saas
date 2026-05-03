/**
 * FEFO/FIFO/LIFO picking logic for Aria Warehouse.
 * Called by pick-allocation API and pick list generation.
 */

export type PickingMethod = 'FEFO' | 'FIFO' | 'LIFO' | 'MANUAL';

export interface LotToPick {
  lot_id: string;
  lot_number: string;
  quantity_available: number;
  expiry_date: string | null;
  received_at: string;
  location_label: string | null;
}

export interface LotAllocation {
  lot_id: string;
  lot_number: string;
  quantity: number;
  location_label: string | null;
}

/** Food/Beverage/Dairy/Pharma categories default to FEFO. All others FIFO. */
export const FEFO_CATEGORIES = [
  'Beer & Cider', 'Wine', 'Spirits', 'RTD', 'Soft Drinks', 'Water', 'Energy Drinks',
  'Sports Drinks', 'Dairy', 'Food', 'Snacks', 'Confectionery', 'Frozen',
  'Pharmaceutical', 'Health', 'Chilled', 'Fresh', 'Bakery',
];

export function getDefaultPickingMethod(category: string | null | undefined): PickingMethod {
  if (!category) return 'FIFO';
  const cat = category.toLowerCase();
  if (FEFO_CATEGORIES.some(c => cat.includes(c.toLowerCase()))) return 'FEFO';
  return 'FIFO';
}

export function sortLotsByMethod(lots: LotToPick[], method: PickingMethod): LotToPick[] {
  switch (method) {
    case 'FEFO':
      return [...lots].sort((a, b) => {
        if (!a.expiry_date && !b.expiry_date) return 0;
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;
        return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
      });
    case 'FIFO':
      return [...lots].sort((a, b) =>
        new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
      );
    case 'LIFO':
      return [...lots].sort((a, b) =>
        new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
      );
    default:
      return lots;
  }
}

export function allocateLots(
  lots: LotToPick[],
  quantityNeeded: number,
  method: PickingMethod
): LotAllocation[] {
  const sorted = sortLotsByMethod(lots.filter(l => l.quantity_available > 0), method);
  const allocations: LotAllocation[] = [];
  let remaining = quantityNeeded;

  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantity_available, remaining);
    allocations.push({
      lot_id: lot.lot_id,
      lot_number: lot.lot_number,
      quantity: take,
      location_label: lot.location_label,
    });
    remaining -= take;
  }
  return allocations;
}

export function calculatePickShortfall(
  allocations: LotAllocation[],
  quantityNeeded: number
): number {
  const totalAllocated = allocations.reduce((s, a) => s + a.quantity, 0);
  return Math.max(0, quantityNeeded - totalAllocated);
}
