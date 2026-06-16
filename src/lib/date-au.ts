// AU-local date helpers, DST-aware via the IANA zone (Australia/Melbourne = UTC+10 AEST ~Apr–Oct /
// UTC+11 AEDT ~Oct–Apr). Sales store created_at in UTC; these compute the correct UTC instants for
// AU-local day/week/month boundaries so "today's revenue", day-of-week patterns and briefing windows
// don't misfile AU-morning trade (the old fixed-+10h "10h-late" bug). Signatures are unchanged.
//
// Contracts (relied on by callers):
//  • nowAEST() and startOfWeekAEST() return a "shifted" Date whose UTC fields read as AU wall-clock —
//    callers do .getDay()/.getHours() (UTC server) or .toISOString().slice(0,10) to get the AU date.
//  • toAESTStart/End, startOfDay/Month/YearAEST, buildDateRange, thirtyDaysAgoAEST return TRUE UTC
//    instants/ISO for querying created_at.

const TZ = 'Australia/Melbourne';

export const AEST_OFFSET = 10 * 60; // minutes — legacy constant, retained for back-compat (no longer used)

// Minutes that Australia/Melbourne is AHEAD of UTC at the given instant (600 = AEST, 660 = AEDT).
function auOffsetMinutes(at: Date): number {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const g = (t: string) => Number(p.find(x => x.type === t)!.value);
  const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return Math.round((asUTC - at.getTime()) / 60000);
}

// True UTC Date for an AU-local wall-clock moment (ymd at h:m:s), DST-aware. Refines once for the
// rare DST-transition edge where the offset at the guess differs from the offset at the result.
function auWallToUtc(ymd: string, h = 0, mi = 0, s = 0): Date {
  const [y, mo, d] = ymd.split('-').map(Number);
  const guessMs = Date.UTC(y, mo - 1, d, h, mi, s);
  const off1 = auOffsetMinutes(new Date(guessMs));
  let utcMs = guessMs - off1 * 60000;
  const off2 = auOffsetMinutes(new Date(utcMs));
  if (off2 !== off1) utcMs = guessMs - off2 * 60000;
  return new Date(utcMs);
}

// Shift `at` by the AU offset so its UTC fields read as AU wall-clock (DST-aware replacement for the
// old fixed +10h). Used for reading the AU calendar (.getDay etc.) and extracting the AU date string.
export function nowAEST(): Date {
  const now = new Date();
  return new Date(now.getTime() + auOffsetMinutes(now) * 60000);
}

// Extract the AU calendar date (YYYY-MM-DD) from a shifted Date (its UTC date-part IS the AU date).
function auDateOf(shifted: Date): string {
  return shifted.toISOString().slice(0, 10);
}

// TRUE UTC instant of AU-local midnight of the AU day that `d` falls in.
export function startOfDayAEST(d = nowAEST()): Date {
  return auWallToUtc(auDateOf(d));
}

// Shifted Date whose UTC date-part is the AU Monday of this week (callers .slice(0,10) it).
export function startOfWeekAEST(): Date {
  const d = nowAEST();
  const day = d.getUTCDay(); // read AU wall-clock weekday from the shifted Date
  const diff = day === 0 ? -6 : 1 - day; // Mon as week start
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// TRUE UTC instant of the first of the current AU month.
export function startOfMonthAEST(): Date {
  return auWallToUtc(auDateOf(nowAEST()).slice(0, 8) + '01');
}

// TRUE UTC instant of 1 Jan of the current AU year.
export function startOfYearAEST(): Date {
  return auWallToUtc(auDateOf(nowAEST()).slice(0, 4) + '-01-01');
}

// Add/subtract whole days to a YYYY-MM-DD (UTC-safe calendar math).
function addDaysYmd(ymd: string, days: number): string {
  const dt = new Date(`${ymd}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function buildDateRange(
  period: string,
  custom?: { from: string; to: string }
): { from: string; to: string } {
  const auYmd = auDateOf(nowAEST());            // today's AU calendar date
  const monYmd = auDateOf(startOfWeekAEST());   // this week's AU Monday
  const toNow = new Date().toISOString();        // true current instant (upper bound)
  const [yy, mm] = auYmd.split('-').map(Number);

  switch (period) {
    case 'today':
      return { from: auWallToUtc(auYmd).toISOString(), to: toNow };
    case 'yesterday': {
      const y = addDaysYmd(auYmd, -1);
      return { from: auWallToUtc(y).toISOString(), to: auWallToUtc(y, 23, 59, 59).toISOString() };
    }
    case 'week':
      return { from: auWallToUtc(monYmd).toISOString(), to: toNow };
    case 'last_week': {
      const lastMon = addDaysYmd(monYmd, -7);
      const lastSun = addDaysYmd(monYmd, -1);
      return { from: auWallToUtc(lastMon).toISOString(), to: auWallToUtc(lastSun, 23, 59, 59).toISOString() };
    }
    case 'month':
      return { from: auWallToUtc(`${auYmd.slice(0, 8)}01`).toISOString(), to: toNow };
    case 'last_month': {
      const lmY = mm === 1 ? yy - 1 : yy;
      const lmM = mm === 1 ? 12 : mm - 1;
      const firstLast = `${lmY}-${String(lmM).padStart(2, '0')}-01`;
      const lastLast = addDaysYmd(`${auYmd.slice(0, 8)}01`, -1); // day before this month's 1st
      return { from: auWallToUtc(firstLast).toISOString(), to: auWallToUtc(lastLast, 23, 59, 59).toISOString() };
    }
    case 'year':
      return { from: auWallToUtc(`${auYmd.slice(0, 4)}-01-01`).toISOString(), to: toNow };
    case 'custom':
      return { from: custom!.from, to: custom!.to };
    default:
      return { from: auWallToUtc(auYmd).toISOString(), to: toNow };
  }
}

// Convert a YYYY-MM-DD string (AU-local date) to the TRUE UTC instant of its AU-local start/end,
// DST-aware. If the string already contains 'T' it is returned unchanged.
export function toAESTStart(d: string): string {
  return d.includes('T') ? d : auWallToUtc(d, 0, 0, 0).toISOString();
}

export function toAESTEnd(d: string): string {
  return d.includes('T') ? d : auWallToUtc(d, 23, 59, 59).toISOString();
}

// Today's date in AU local time as YYYY-MM-DD.
export function todayAEST(): string {
  return auDateOf(nowAEST());
}

// TRUE UTC instant of AU-local midnight 30 days ago.
export function thirtyDaysAgoAEST(): string {
  return auWallToUtc(addDaysYmd(auDateOf(nowAEST()), -30)).toISOString();
}
