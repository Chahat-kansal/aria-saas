// ARIA-DISPLAY-1 — the journey manifest.
//
// A typed constant, not a table. A later sprint can move this to the database without touching the
// player: the player only ever consumes `Leg` and `Clip`, never these literals.
//
// ASSET VERIFICATION (run 2026-08-10, before any of this was built on):
//   all 8 clips  -> HTTP 200, content-type video/mp4
//   leg-01 total -> 30,543,344 bytes ≈ 29.1 MB
//   posters      -> arrive-v1.jpg returns HTTP 400. THE POSTERS DO NOT EXIST. The `poster` field
//                   below is populated for shape/forward-compat, but the player does NOT use it as
//                   an <img> source — it falls back to the video's own first frame via
//                   preload="metadata", per the brief. Nothing invented.
//   storage sends Cache-Control: public, max-age=3600 — only ONE HOUR. That is why the player
//                   caches through the Cache API rather than trusting the HTTP cache; see
//                   JourneyPlayer's cache notes.

export type ClipRole =
  | 'arrive' | 'explore-a' | 'explore-b' | 'incident'
  | 'rest' | 'night' | 'storm' | 'depart';

export interface Clip { role: ClipRole; url: string; poster: string }
export interface Leg  { id: string; name: string; clips: Clip[] }

const BASE =
  'https://nxfzippunqvqsvkmwtjv.supabase.co/storage/v1/object/public/display';

// The `-v1` suffix is load-bearing. Assets are NEVER overwritten in place; a new cut ships as -v2
// and this manifest bumps. That is what makes an aggressive device cache safe, and it is why the
// player must never cache-bust with a query string — the filename IS the cache key.
const leg = (id: string, name: string, roles: ClipRole[]): Leg => ({
  id,
  name,
  clips: roles.map((role) => ({
    role,
    url:    `${BASE}/${id}/${role}-v1.mp4`,
    poster: `${BASE}/${id}/${role}-v1.jpg`,
  })),
});

export const JOURNEY: Leg[] = [
  leg('leg-01', 'Southern Ocean cliffs', [
    'arrive', 'explore-a', 'explore-b', 'incident',
    'rest', 'night', 'storm', 'depart',
  ]),
];

export const CURRENT_LEG = JOURNEY[0];

// ── ORDERING ────────────────────────────────────────────────────────────────────────────────────
// arrive → explore → incident → rest → depart, with night/storm substituted by context.
// explore-a and explore-b are two camera angles of the same beat, so both are treated as 'explore'.

/** Roles that are pinned to the ends of every pass. */
const FIRST: ClipRole = 'arrive';
const LAST: ClipRole = 'depart';
/** Roles only shown when their context applies — never in the default rotation. */
const CONTEXTUAL: ClipRole[] = ['night', 'storm'];

export interface JourneyContext {
  /** True after sunset in the venue's timezone. */
  isNight: boolean;
  /** True when the venue is in rain. Always false in DISPLAY-1 — no client-side weather signal. */
  isStorm: boolean;
}

/**
 * One pass through the leg: arrive first, depart last, middle shuffled so consecutive loops are not
 * identical. Contextual clips join the middle only when their context is live.
 *
 * `rand` is injected so the ordering is testable and so the shuffle is not silently non-deterministic
 * at a call site that needs to reason about it.
 */
export function buildPass(leg: Leg, ctx: JourneyContext, rand: () => number = Math.random): Clip[] {
  const by = (r: ClipRole) => leg.clips.find((c) => c.role === r);

  const middle = leg.clips.filter(
    (c) => c.role !== FIRST && c.role !== LAST && !CONTEXTUAL.includes(c.role),
  );
  if (ctx.isNight) { const n = by('night'); if (n) middle.push(n); }
  if (ctx.isStorm) { const s = by('storm'); if (s) middle.push(s); }

  // Fisher-Yates over a copy — never mutate the manifest.
  const shuffled = [...middle];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const out: Clip[] = [];
  const first = by(FIRST); if (first) out.push(first);
  out.push(...shuffled);
  const last = by(LAST); if (last) out.push(last);
  return out;
}

/**
 * Is it after sunset in `tz`?
 *
 * ⚠ APPROXIMATION, AND STATED AS ONE. True sunset needs latitude and longitude; a timezone alone
 * cannot give it, and this sprint has no venue coordinates. This is a civil-hours heuristic: before
 * 07:00 or from 19:00 local. For a southern-Australian venue that is wrong by up to ~90 minutes at
 * the solstices. Fixing it properly means storing venue lat/long — a DISPLAY-2 decision, not a
 * silent fudge here.
 */
export function isNightIn(tz: string, now: Date = new Date()): boolean {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hour12: false, timeZone: tz }).format(now),
    );
  } catch {
    // Unknown/invalid timezone — fall back to the device clock rather than throwing on a shop screen.
    hour = now.getHours();
  }
  if (!Number.isFinite(hour)) hour = now.getHours();
  return hour < 7 || hour >= 19;
}
