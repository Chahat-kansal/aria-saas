import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_TZ, resolveTimezone, businessNow, businessToday, todayAEST, toAESTWallClock,
} from './date-au'

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const MEL = 'Australia/Melbourne'
const PER = 'Australia/Perth'      // +8, no DST
const BNE = 'Australia/Brisbane'   // +10, no DST

/**
 * TZ-RAIL-1 — THE CANONICAL BUSINESS-TIME RAIL.
 *
 * Storage was never the problem: 996 timestamptz columns and zero naive timestamps. DERIVATION is
 * the problem — three timezone columns with no precedence between them, and 280 places computing a
 * date from `toISOString().slice(0,10)`, which is UTC.
 */
describe('TZ-RAIL-1 · the 8am bug this rail exists to stop', () => {
  it('AT 8AM MELBOURNE, UTC IS STILL YESTERDAY — and the rail is not', () => {
    // 2 Sep 2026, 08:00 Melbourne. September is AEST (+10), so that is 22:00 UTC on 1 Sep.
    const at = new Date('2026-09-01T22:00:00.000Z')
    expect(at.toISOString().slice(0, 10)).toBe('2026-09-01')   // what 280 call sites would say
    expect(businessNow(MEL, at).date).toBe('2026-09-02')       // what the business's day actually is
    expect(businessToday(MEL, at)).toBe('2026-09-02')
    expect(businessNow(MEL, at).dayName).toBe('Wednesday')
  })

  it('and it is a whole trading morning wide, not an edge case', () => {
    // Midnight through ~10am Melbourne all land on the previous UTC date in September.
    for (const utcHour of ['14:00', '16:00', '20:00', '22:00', '23:59']) {
      const at = new Date('2026-09-01T' + utcHour + ':00.000Z')
      expect(at.toISOString().slice(0, 10)).toBe('2026-09-01')
      expect(businessNow(MEL, at).date).toBe('2026-09-02')
    }
  })

  it('DST is handled by the zone, not an offset — Melbourne shifts, Brisbane and Perth do not', () => {
    // 15 Jan 2026 is AEDT (+11) in Melbourne; Brisbane stays +10 and Perth +8 all year.
    const summer = new Date('2026-01-14T21:00:00.000Z')   // 08:00 Melbourne (AEDT)
    expect(businessNow(MEL, summer).date).toBe('2026-01-15')
    expect(businessNow(BNE, summer).date).toBe('2026-01-15')   // 07:00 Brisbane, same day
    expect(businessNow(PER, summer).date).toBe('2026-01-15')   // 05:00 Perth, same day

    // The hour is where they differ, and a fixed +10 would give Brisbane a phantom DST hour.
    expect(businessNow(MEL, summer).time).toMatch(/^8:00/)
    expect(businessNow(BNE, summer).time).toMatch(/^7:00/)
    expect(businessNow(PER, summer).time).toMatch(/^5:00/)
  })
})

describe('TZ-RAIL-1 · one source of a business date, not a fourth', () => {
  it('THE PIN — businessNow().date can never disagree with todayAEST()', () => {
    // This is the whole N-copies argument in one assertion. `businessToday` is a NAME, not a
    // second algorithm; if someone later reimplements it, this goes red.
    for (const tz of [MEL, PER, BNE, 'Pacific/Auckland', 'UTC']) {
      expect(businessNow(tz).date).toBe(todayAEST(tz))
      expect(businessToday(tz)).toBe(todayAEST(tz))
    }
  })

  it('an arbitrary instant is bucketed by the same rule as "now"', () => {
    // businessNow(tz, at) must agree with the module's own wall-clock helper.
    const at = new Date('2026-09-01T22:00:00.000Z')
    expect(businessNow(MEL, at).date).toBe(toAESTWallClock(at.toISOString(), MEL).toISOString().slice(0, 10))
  })

  it('NO SECOND RAIL WAS CREATED — there is no business-time.ts', () => {
    // The sprint asked for `lib/business-time.ts`. Creating it would have been a fourth
    // implementation of "what day is it", beside todayAEST() which 50 files already import.
    // The rail lives in the module that already owns the concept.
    expect(existsSync(join(root, 'lib/business-time.ts'))).toBe(false)
    expect(existsSync(join(root, 'src/lib/business-time.ts'))).toBe(false)

    // And exactly one file defines these.
    const libFiles = readdirSync(join(root, 'src/lib'))
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    const definers = libFiles.filter(f => /export function businessToday|export function businessNow/
      .test(read('src/lib/' + f)))
    // ANTI-VACUITY: the scan must have actually read files, or "exactly one" means nothing.
    expect(libFiles.length, 'the lib scan found nothing').toBeGreaterThan(10)
    expect(definers).toEqual(['date-au.ts'])
  })

  it('MUTATION PROBE — a second businessToday would be visible to that scan', () => {
    const libFiles = readdirSync(join(root, 'src/lib')).filter(f => f.endsWith('.ts'))
    const pretendSecond = [...libFiles, 'business-time.ts']
    expect(pretendSecond).toContain('business-time.ts')
    expect(libFiles).not.toContain('business-time.ts')
  })
})

describe('TZ-RAIL-1 · precedence is the rail’s job, not the caller’s', () => {
  it('outlet wins, then business, then the default', () => {
    expect(resolveTimezone(PER, MEL)).toBe(PER)
    expect(resolveTimezone(null, MEL)).toBe(MEL)
    expect(resolveTimezone(undefined, undefined)).toBe(DEFAULT_TZ)
    expect(DEFAULT_TZ).toBe(MEL)
  })

  it('blank and whitespace-only are absent, not authoritative', () => {
    expect(resolveTimezone('', MEL)).toBe(MEL)
    expect(resolveTimezone('   ', MEL)).toBe(MEL)
    expect(resolveTimezone('', '')).toBe(DEFAULT_TZ)
  })

  it('AN INVALID ZONE IS TREATED AS ABSENT, never trusted', () => {
    // A bad string in one column must not poison the answer — fall through to the next source.
    expect(resolveTimezone('Mars/Olympus', MEL)).toBe(MEL)
    expect(resolveTimezone('Australia/Melbourn', MEL)).toBe(MEL)   // typo
    expect(resolveTimezone('Mars/Olympus', 'Also/Nonsense')).toBe(DEFAULT_TZ)
    // and businessNow never throws on one
    expect(businessNow('Mars/Olympus').timezone).toBe(DEFAULT_TZ)
  })

  it('pos_settings.timezone is deliberately NOT consulted, and NOT deleted', () => {
    // Three copies of one fact with no precedence is the drift; reading a third source with no
    // defined authority would entrench it. RULE 0: it stays in the database untouched.
    const src = strip(read('src/lib/date-au.ts'))
    expect(src).not.toMatch(/pos_settings/)
    expect(read('src/lib/date-au.ts')).toMatch(/pos_settings\.timezone/)   // named in the comment
  })
})

describe('TZ-RAIL-1 · groundTruth carries the date (RULE 9)', () => {
  const ctx = read('src/lib/aria/ask/business-context.ts')

  it('the four fields are on the context type and emitted', () => {
    for (const f of ['today', 'day_name', 'local_time', 'timezone']) {
      expect(strip(ctx), 'AskAriaContext is missing ' + f).toMatch(new RegExp('^\\s*' + f + ':', 'm'))
    }
    expect(strip(ctx)).toMatch(/today: bn\.date/)
    expect(strip(ctx)).toMatch(/day_name: bn\.dayName/)
    expect(strip(ctx)).toMatch(/local_time: bn\.time/)
    expect(strip(ctx)).toMatch(/timezone: bn\.timezone/)
  })

  it('THE LIVE BUG THIS FIXES — the boundaries now use the business zone, not the default', () => {
    // Every one of these was `todayAEST()` with NO argument, so Ask Aria's "today" was computed
    // from the Melbourne default rather than the business's own zone.
    expect(strip(ctx)).toMatch(/toAESTStart\(todayAEST\(tz\), tz\)/)
    expect(strip(ctx)).toMatch(/startOfWeekAEST\(tz\)/)
    expect(strip(ctx), 'a bare todayAEST() survived — that ignores the business zone')
      .not.toMatch(/todayAEST\(\)/)
  })

  it('THE DATE-COLUMN PAIR AT :366 IS DELIBERATELY LEFT ALONE — changing one side is a REGRESSION', () => {
    // `business-context.ts:366` computes a UTC `todayStr` to look up
    // `agent_council_sessions.session_date`, a bare `date` column. For the whole Melbourne morning
    // that reads YESTERDAY's row, which looks exactly like a bug worth a one-line fix.
    //
    // IT IS NOT. The WRITER (src/lib/agents/council.ts:213) computes its `today` the same UTC way.
    // Reader and writer currently AGREE. Making the reader zone-aware on its own would ask for
    // 2 Sep while the writer had stamped 1 Sep — introducing the very mismatch this rail exists to
    // remove. Fixing it means changing both sides together AND deciding what happens to rows
    // already stamped in UTC, which is TZ-RAIL-2's job (123 bare `date` columns across 85 tables).
    //
    // This assertion exists so nobody "tidies" one half of the pair. If you change either, change
    // both, and handle the existing rows.
    const ctxSrc = read('src/lib/aria/ask/business-context.ts')
    const writerSrc = read('src/lib/agents/council.ts')
    expect(ctxSrc).toMatch(/const todayStr = new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/)
    expect(writerSrc).toMatch(/const today = new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/)
  })

  it('NO NEW QUERY — the timezone rides the businesses row it already fetched', () => {
    // The sprint is explicit: do not add DB queries to fetch a timezone.
    expect(ctx).toMatch(/\.select\('name,industry,[^']*timezone'\)/)
    // and the resolver used is the existing cached one, not a fresh select
    expect(strip(ctx)).toMatch(/resolveBusinessTimezone\(businessId\)/)
    expect((strip(ctx).match(/from\('businesses'\)/g) ?? []).length,
      'a second businesses query appeared').toBe(1)
  })
})
