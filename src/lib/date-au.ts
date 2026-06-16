// AU-local date helpers, DST-aware via the IANA zone. TZ-3: every helper takes an OPTIONAL `tz`
// (IANA string) so per-business callers can pass businesses.timezone; when omitted/invalid it
// defaults to Australia/Melbourne — so existing callers that pass nothing behave EXACTLY as TZ-2
// (no regression). Correctness across AU zones: Melbourne/Sydney observe DST (+10 AEST / +11 AEDT)
// while Perth (+8) and Brisbane (+10) do NOT — using the IANA zone (not a fixed offset) gets all of
// them right, including not giving Brisbane a phantom DST hour in summer.
//
// Contracts (relied on by callers):
//  • nowAEST() and startOfWeekAEST() return a "shifted" Date whose UTC fields read as local wall-clock
//    — callers do .getDay()/.getHours() (UTC server) or .toISOString().slice(0,10) to get the date.
//  • toAESTStart/End, startOfDay/Month/YearAEST, buildDateRange, thirtyDaysAgoAEST return TRUE UTC
//    instants/ISO for querying created_at.

const MEL = 'Australia/Melbourne';

export const AEST_OFFSET = 10 * 60; // minutes — legacy constant, retained for back-compat (no longer used)

// Validate an IANA zone once (cached); fall back to Melbourne for null/invalid input.
const _tzValid = new Map<string, boolean>();
function isValidZone(tz: string): boolean {
  const cached = _tzValid.get(tz);
  if (cached !== undefined) return cached;
  let ok = false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); ok = true; } catch { ok = false; }
  _tzValid.set(tz, ok);
  return ok;
}
function resolveZone(tz?: string | null): string {
  return tz && isValidZone(tz) ? tz : MEL;
}

// Minutes that `zone` is AHEAD of UTC at the given instant (e.g. 600 AEST, 660 AEDT, 480 Perth).
function offsetMinutes(at: Date, zone: string): number {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const g = (t: string) => Number(p.find(x => x.type === t)!.value);
  const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return Math.round((asUTC - at.getTime()) / 60000);
}

// True UTC Date for a local wall-clock moment (ymd at h:m:s) in `zone`, DST-aware. Refines once for
// the rare DST-transition edge where the offset at the guess differs from the offset at the result.
function wallToUtc(ymd: string, h: number, mi: number, s: number, zone: string): Date {
  const [y, mo, d] = ymd.split('-').map(Number);
  const guessMs = Date.UTC(y, mo - 1, d, h, mi, s);
  const off1 = offsetMinutes(new Date(guessMs), zone);
  let utcMs = guessMs - off1 * 60000;
  const off2 = offsetMinutes(new Date(utcMs), zone);
  if (off2 !== off1) utcMs = guessMs - off2 * 60000;
  return new Date(utcMs);
}

// "Now" shifted so its UTC fields read as wall-clock in `zone`.
function shiftedNow(zone: string): Date {
  const now = new Date();
  return new Date(now.getTime() + offsetMinutes(now, zone) * 60000);
}

// Extract the local calendar date (YYYY-MM-DD) from a shifted Date (its UTC date-part IS the date).
function auDateOf(shifted: Date): string {
  return shifted.toISOString().slice(0, 10);
}

// Add/subtract whole days to a YYYY-MM-DD (UTC-safe calendar math).
function addDaysYmd(ymd: string, days: number): string {
  const dt = new Date(`${ymd}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// ── Public API (optional tz; defaults to Melbourne when omitted/invalid) ──────────────────────────

export function nowAEST(tz?: string | null): Date {
  return shiftedNow(resolveZone(tz));
}

// TRUE UTC instant of local midnight of the day that `d` falls in.
export function startOfDayAEST(d?: Date, tz?: string | null): Date {
  const zone = resolveZone(tz);
  const base = d ?? shiftedNow(zone);
  return wallToUtc(auDateOf(base), 0, 0, 0, zone);
}

// Shifted Date whose UTC date-part is the local Monday of this week (callers .slice(0,10) it).
export function startOfWeekAEST(tz?: string | null): Date {
  const zone = resolveZone(tz);
  const d = shiftedNow(zone);
  const day = d.getUTCDay(); // local weekday from the shifted Date
  const diff = day === 0 ? -6 : 1 - day; // Mon as week start
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// TRUE UTC instant of the first of the current local month.
export function startOfMonthAEST(tz?: string | null): Date {
  const zone = resolveZone(tz);
  return wallToUtc(auDateOf(shiftedNow(zone)).slice(0, 8) + '01', 0, 0, 0, zone);
}

// TRUE UTC instant of 1 Jan of the current local year.
export function startOfYearAEST(tz?: string | null): Date {
  const zone = resolveZone(tz);
  return wallToUtc(auDateOf(shiftedNow(zone)).slice(0, 4) + '-01-01', 0, 0, 0, zone);
}

export function buildDateRange(
  period: string,
  custom?: { from: string; to: string },
  tz?: string | null,
): { from: string; to: string } {
  const zone = resolveZone(tz);
  const auYmd = auDateOf(shiftedNow(zone));            // today's local calendar date
  const monYmd = auDateOf(startOfWeekAEST(zone));      // this week's local Monday
  const toNow = new Date().toISOString();              // true current instant (upper bound)
  const [yy, mm] = auYmd.split('-').map(Number);
  const start = (ymd: string) => wallToUtc(ymd, 0, 0, 0, zone).toISOString();
  const end = (ymd: string) => wallToUtc(ymd, 23, 59, 59, zone).toISOString();

  switch (period) {
    case 'today':
      return { from: start(auYmd), to: toNow };
    case 'yesterday': {
      const y = addDaysYmd(auYmd, -1);
      return { from: start(y), to: end(y) };
    }
    case 'week':
      return { from: start(monYmd), to: toNow };
    case 'last_week':
      return { from: start(addDaysYmd(monYmd, -7)), to: end(addDaysYmd(monYmd, -1)) };
    case 'month':
      return { from: start(`${auYmd.slice(0, 8)}01`), to: toNow };
    case 'last_month': {
      const lmY = mm === 1 ? yy - 1 : yy;
      const lmM = mm === 1 ? 12 : mm - 1;
      const firstLast = `${lmY}-${String(lmM).padStart(2, '0')}-01`;
      const lastLast = addDaysYmd(`${auYmd.slice(0, 8)}01`, -1); // day before this month's 1st
      return { from: start(firstLast), to: end(lastLast) };
    }
    case 'year':
      return { from: start(`${auYmd.slice(0, 4)}-01-01`), to: toNow };
    case 'custom':
      return { from: custom!.from, to: custom!.to };
    default:
      return { from: start(auYmd), to: toNow };
  }
}

// Convert a YYYY-MM-DD string (local date) to the TRUE UTC instant of its local start/end, DST-aware.
// If the string already contains 'T' it is returned unchanged.
export function toAESTStart(d: string, tz?: string | null): string {
  return d.includes('T') ? d : wallToUtc(d, 0, 0, 0, resolveZone(tz)).toISOString();
}

export function toAESTEnd(d: string, tz?: string | null): string {
  return d.includes('T') ? d : wallToUtc(d, 23, 59, 59, resolveZone(tz)).toISOString();
}

// Today's date in local time as YYYY-MM-DD.
export function todayAEST(tz?: string | null): string {
  return auDateOf(shiftedNow(resolveZone(tz)));
}

// TRUE UTC instant of local midnight 30 days ago.
export function thirtyDaysAgoAEST(tz?: string | null): string {
  const zone = resolveZone(tz);
  return wallToUtc(addDaysYmd(auDateOf(shiftedNow(zone)), -30), 0, 0, 0, zone).toISOString();
}
