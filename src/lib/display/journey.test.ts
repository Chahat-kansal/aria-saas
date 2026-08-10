import { describe, it, expect } from 'vitest'
import { CURRENT_LEG, JOURNEY, buildPass, isNightIn, type Clip, type ClipRole } from '@/lib/display/journey'

// ARIA-DISPLAY-1 — the ordering rules are pure, so they can be proven here instead of by watching a
// screen for ten minutes. The player's own behaviour (crossfade, cache, stall recovery) needs a
// browser; this covers the part that does not.

const roles = (cs: Clip[]): ClipRole[] => cs.map((c) => c.role)
/** Deterministic stand-in for Math.random so shuffles are reproducible. */
const seq = (...ns: number[]) => { let i = 0; return () => ns[i++ % ns.length] }

describe('journey manifest', () => {
  it('POSITIVE CONTROL — the leg actually has the eight verified clips', () => {
    // Without this, every assertion below could pass against an empty leg.
    expect(JOURNEY).toHaveLength(1)
    expect(CURRENT_LEG.clips).toHaveLength(8)
    expect(roles(CURRENT_LEG.clips).sort()).toEqual(
      ['arrive', 'depart', 'explore-a', 'explore-b', 'incident', 'night', 'rest', 'storm'].sort(),
    )
  })

  it('derives URLs rather than hardcoding them, and keeps the -v1 cache key', () => {
    // The -v1 suffix is what makes an aggressive device cache safe. Stripping it silently turns
    // every cached clip into a potential stale hit when a new cut ships.
    for (const c of CURRENT_LEG.clips) {
      expect(c.url).toBe(
        'https://nxfzippunqvqsvkmwtjv.supabase.co/storage/v1/object/public/display/leg-01/' + c.role + '-v1.mp4',
      )
      expect(c.url).not.toContain('?')   // never cache-bust by query string
    }
  })
})

describe('buildPass', () => {
  const day = { isNight: false, isStorm: false }

  it('arrive is always first and depart always last', () => {
    for (let i = 0; i < 20; i++) {
      const p = roles(buildPass(CURRENT_LEG, day))
      expect(p[0]).toBe('arrive')
      expect(p[p.length - 1]).toBe('depart')
    }
  })

  it('excludes night and storm during a clear day', () => {
    const p = roles(buildPass(CURRENT_LEG, day))
    expect(p).not.toContain('night')
    expect(p).not.toContain('storm')
    expect(p).toEqual(expect.arrayContaining(['explore-a', 'explore-b', 'incident', 'rest']))
  })

  it('adds the night clip after sunset — and still keeps the ends pinned', () => {
    const p = roles(buildPass(CURRENT_LEG, { isNight: true, isStorm: false }))
    expect(p).toContain('night')
    expect(p[0]).toBe('arrive')
    expect(p[p.length - 1]).toBe('depart')
  })

  it('storm only appears when a storm signal says so — which DISPLAY-1 never does', () => {
    // The player hardcodes isStorm:false because no client-side weather signal exists. This asserts
    // the manifest would honour one, so DISPLAY-2 can switch it on without touching buildPass.
    expect(roles(buildPass(CURRENT_LEG, { isNight: false, isStorm: true }))).toContain('storm')
    expect(roles(buildPass(CURRENT_LEG, day))).not.toContain('storm')
  })

  it('shuffles the middle — consecutive passes are not identical', () => {
    const a = roles(buildPass(CURRENT_LEG, day, seq(0, 0, 0, 0)))
    const b = roles(buildPass(CURRENT_LEG, day, seq(0.99, 0.99, 0.99, 0.99)))
    expect(a).not.toEqual(b)
    // ...but every pass is the same SET, so no clip is ever dropped by shuffling.
    expect([...a].sort()).toEqual([...b].sort())
  })

  it('never mutates the manifest', () => {
    const before = roles(CURRENT_LEG.clips)
    buildPass(CURRENT_LEG, { isNight: true, isStorm: true })
    buildPass(CURRENT_LEG, day)
    expect(roles(CURRENT_LEG.clips)).toEqual(before)
  })
})

describe('isNightIn', () => {
  // 2026-08-10T09:00:00Z = 19:00 Melbourne (AEST, UTC+10) -> night; 02:00Z = 12:00 -> day.
  it('reads the hour in the venue timezone, not the server one', () => {
    expect(isNightIn('Australia/Melbourne', new Date('2026-08-10T09:00:00Z'))).toBe(true)
    expect(isNightIn('Australia/Melbourne', new Date('2026-08-10T02:00:00Z'))).toBe(false)
    // Same instant, different venue: 09:00Z is 10:00 in London -> daytime there.
    expect(isNightIn('Europe/London', new Date('2026-08-10T09:00:00Z'))).toBe(false)
  })

  it('falls back to the device clock on an invalid timezone instead of throwing', () => {
    // A bad businesses.timezone value must not take a shop screen down.
    expect(() => isNightIn('Not/AZone', new Date('2026-08-10T09:00:00Z'))).not.toThrow()
    expect(typeof isNightIn('Not/AZone')).toBe('boolean')
  })
})
