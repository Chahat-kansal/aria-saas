export const AEST_OFFSET = 10 * 60; // minutes

export function nowAEST(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + AEST_OFFSET * 60000);
}

export function startOfDayAEST(d = nowAEST()): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

export function startOfWeekAEST(): Date {
  const d = nowAEST();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Mon as week start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonthAEST(): Date {
  const d = nowAEST();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfYearAEST(): Date {
  return new Date(nowAEST().getFullYear(), 0, 1);
}

export function buildDateRange(
  period: string,
  custom?: { from: string; to: string }
): { from: string; to: string } {
  const now = nowAEST();
  switch (period) {
    case 'today':
      return { from: startOfDayAEST(now).toISOString(), to: now.toISOString() };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      y.setHours(0, 0, 0, 0);
      const ye = new Date(y);
      ye.setHours(23, 59, 59, 999);
      return { from: y.toISOString(), to: ye.toISOString() };
    }
    case 'week':
      return { from: startOfWeekAEST().toISOString(), to: now.toISOString() };
    case 'last_week': {
      const sw = startOfWeekAEST();
      sw.setDate(sw.getDate() - 7);
      const ew = new Date(sw);
      ew.setDate(ew.getDate() + 6);
      ew.setHours(23, 59, 59, 999);
      return { from: sw.toISOString(), to: ew.toISOString() };
    }
    case 'month':
      return { from: startOfMonthAEST().toISOString(), to: now.toISOString() };
    case 'last_month': {
      const now2 = nowAEST();
      const sm = new Date(now2.getFullYear(), now2.getMonth() - 1, 1);
      const em = new Date(now2.getFullYear(), now2.getMonth(), 0);
      em.setHours(23, 59, 59, 999);
      return { from: sm.toISOString(), to: em.toISOString() };
    }
    case 'year':
      return { from: startOfYearAEST().toISOString(), to: now.toISOString() };
    case 'custom':
      return { from: custom!.from, to: custom!.to };
    default:
      return { from: startOfDayAEST(now).toISOString(), to: now.toISOString() };
  }
}

// Convert a YYYY-MM-DD string (interpreted as AEST local date) to ISO with +10:00 offset.
// If the string already contains 'T' it is returned unchanged.
export function toAESTStart(d: string): string {
  return d.includes('T') ? d : `${d}T00:00:00+10:00`;
}

export function toAESTEnd(d: string): string {
  return d.includes('T') ? d : `${d}T23:59:59+10:00`;
}

// Returns today's date in AEST as YYYY-MM-DD
export function todayAEST(): string {
  const d = nowAEST();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Returns an ISO string 30 days before now in AEST
export function thirtyDaysAgoAEST(): string {
  const d = nowAEST();
  d.setDate(d.getDate() - 30);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
