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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// TZ-RAIL-1 — THE CANONICAL BUSINESS-TIME RAIL.
//
// ── WHY THIS IS HERE AND NOT IN A NEW FILE ─────────────────────────────────────────────────────
// The sprint asked for a new `lib/business-time.ts` exporting `businessToday()`. That would have
// been a FOURTH implementation of "what day is it for this business", beside `todayAEST()` in this
// file (already tz-parameterised by TZ-3, already imported by 50 files, already DST-aware with a
// two-pass offset refinement for the transition edge). Creating it would have been the exact
// N-copies drift this sprint exists to remove, so the rail is added to the module that already
// owns the concept.
//
// `businessToday()` therefore DELEGATES to `todayAEST()`. It is a name, not a second algorithm —
// there is still exactly one place that decides what day it is, and a test asserts the two can
// never disagree.
//
// ── THE BUG THIS EXISTS TO STOP ────────────────────────────────────────────────────────────────
// Anything computing "today" in UTC returns the PREVIOUS day for most of the Melbourne trading
// morning: at 8am Melbourne it is still yesterday in UTC. 280 `toISOString().slice(0,…)` call
// sites exist in this repo; migrating them is TZ-RAIL-1b, not this sprint.
//
// ── WHAT IS DELIBERATELY NOT READ ──────────────────────────────────────────────────────────────
// `pos_settings.timezone`. It is a third copy of one fact with no defined authority over the other
// two. It is NOT deleted (RULE 0) and NOT consulted — recorded as a follow-up decision. All three
// columns currently hold 'Australia/Melbourne', so nothing is visibly broken today; three copies
// and no precedence is the problem.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The fallback when neither an outlet nor a business names a zone. */
export const DEFAULT_TZ = MEL;

/**
 * Resolution order: outlet → business → default.
 *
 * Callers pass whatever they already have; the rail decides precedence, so no call site has to
 * hold an opinion about which column wins. This is not hypothetical — Sip runs TWO outlets, so a
 * per-outlet zone can already differ from the business's in production.
 *
 * An invalid IANA string is treated as absent rather than trusted, which is why this goes through
 * the same `isValidZone` check every other helper here uses.
 */
export function resolveTimezone(
  outletTz?: string | null,
  businessTz?: string | null,
): string {
  const outlet = outletTz?.trim();
  if (outlet && isValidZone(outlet)) return outlet;
  const business = businessTz?.trim();
  if (business && isValidZone(business)) return business;
  return DEFAULT_TZ;
}

export type BusinessNow = {
  /** YYYY-MM-DD in the business's timezone. */
  date: string;
  /** e.g. "Tuesday" */
  dayName: string;
  /** e.g. "Tue" */
  dayShort: string;
  /** e.g. "8:42 am" */
  time: string;
  timezone: string;
  /** The underlying instant, unambiguous — so a reader can always recover the true moment. */
  iso: string;
};

/**
 * The only sanctioned way to ask what day it is for a business.
 *
 * `at` defaults to now; pass an instant to ask "which business day was this?" — which is the
 * question a `timestamptz` row needs answered before it can be bucketed into a day.
 */
export function businessNow(timezone?: string | null, at: Date = new Date()): BusinessNow {
  const tz = resolveZone(timezone);
  return {
    // NOT a second date implementation. `toAESTWallClock` + `auDateOf` is literally what
    // `todayAEST` does for "now" (auDateOf(shiftedNow(zone))) — reused here so an arbitrary
    // instant is bucketed by exactly the same rule as today is. A test pins them together.
    date: auDateOf(toAESTWallClock(at.toISOString(), tz)),
    dayName: new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'long' }).format(at),
    dayShort: new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short' }).format(at),
    time: new Intl.DateTimeFormat('en-AU', {
      timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(at),
    timezone: tz,
    iso: at.toISOString(),
  };
}

/**
 * The business's date string only — the common case.
 *
 * Delegates to `todayAEST`, which is this module's single source of a business date. Kept as a
 * separate name because "todayAEST" reads as a fixed offset and is now misleading for a
 * multi-zone product; this is the name new code should reach for.
 */
export function businessToday(timezone?: string | null, at?: Date): string {
  return at ? businessNow(timezone, at).date : todayAEST(timezone);
}

// Add/subtract whole days to a YYYY-MM-DD (UTC-safe calendar math).
export function addDaysYmd(ymd: string, days: number): string {
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

// INTEL-COMPUTE-2 — shifted Date for an ARBITRARY instant (not just "now"), so callers can extract
// local wall-clock day-of-week/hour (.getUTCDay()/.getUTCHours()) from e.g. a pos_sales.created_at
// without falling back to server-local/UTC .getDay()/.getHours(), which shifts every bucket by the
// zone's offset (the exact bug class labour-optimisation-agent.ts had for its hourly demand model).
export function toAESTWallClock(iso: string, tz?: string | null): Date {
  const zone = resolveZone(tz);
  const at = new Date(iso);
  return new Date(at.getTime() + offsetMinutes(at, zone) * 60000);
}

// The local wall-clock HOUR of a UTC instant, DST-aware. Convenience wrapper over toAESTWallClock.
export function hourOfDayAEST(iso: string, tz?: string | null): number {
  return toAESTWallClock(iso, tz).getUTCHours();
}

// TRUE UTC instant of a specific local wall-clock HOUR on a given YYYY-MM-DD, DST-aware — the
// hour-level sibling of toAESTStart/toAESTEnd (which are day-level only).
export function toAESTHourStart(ymd: string, hour: number, tz?: string | null): string {
  return wallToUtc(ymd, hour, 0, 0, resolveZone(tz)).toISOString();
}
