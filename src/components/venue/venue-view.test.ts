import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PX_TO_M, needsYou, seatedMinutes, dotColour, rowLabel, rowZone, type VenueRow } from './venue-rules'

/**
 * VENUE-VIEW-1 — the computed parts of the venue view.
 *
 * ⚠️ WHAT THESE PROVE: the NEEDS-YOU rule, the dot colour it drives, and the scale constant. These
 * are the only places this feature computes rather than displays, so they are the only places it can
 * be wrong about the business rather than about pixels.
 *
 * ⚠️ WHAT THEY CANNOT PROVE: that the room renders. three.js needs WebGL, which jsdom does not have.
 * The scene is verified in a browser and that is recorded in docs/aria/runs/VENUE-VIEW-1.md — not
 * claimed here. This file deliberately does NOT assert "the component exists": that is the
 * presence-not-behaviour pattern this repo has been bitten by seven times.
 */

const ROW = (over: Partial<VenueRow> = {}): VenueRow => ({
  id: 't1', name: 'T1', element_type: 'table', status: 'available',
  seats: 4, pos_x: 0, pos_y: 0, width: 72, height: 72, ...over,
})

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

describe('VENUE-VIEW-1 · the NEEDS-YOU rule', () => {
  it('fires: occupied, no sale rung, seated more than 20 minutes', () => {
    expect(needsYou(ROW({ status: 'occupied', current_sale_id: null, occupied_since: minsAgo(21) }))).toBe(true)
  })

  // ⚠️ Each of the three conditions is removed in turn. Without these, a needsYou() that returned
  // `true` whenever status === 'occupied' would pass the test above and flag the whole room red.
  it('does NOT fire when a sale is already rung', () => {
    expect(needsYou(ROW({ status: 'occupied', current_sale_id: 'sale-1', occupied_since: minsAgo(90) }))).toBe(false)
  })
  it('does NOT fire inside the 20-minute grace window', () => {
    expect(needsYou(ROW({ status: 'occupied', current_sale_id: null, occupied_since: minsAgo(19) }))).toBe(false)
  })
  it('does NOT fire exactly ON 20 minutes — the rule is strictly more than', () => {
    expect(needsYou(ROW({ status: 'occupied', current_sale_id: null, occupied_since: minsAgo(20) }))).toBe(false)
  })
  it('does NOT fire for a table that is not occupied, however long ago it was seated', () => {
    for (const status of ['available', 'reserved', 'cleaning']) {
      expect(needsYou(ROW({ status, current_sale_id: null, occupied_since: minsAgo(500) })), status).toBe(false)
    }
  })

  it('⚠️ does NOT fire when the seating time is UNKNOWN — absent, empty, or unparseable', () => {
    // GROUNDING-TEETH. A missing timestamp is not evidence of a 20-minute wait. Treating `null` as
    // epoch-0 would make every occupied row with no timestamp scream for attention.
    for (const occupied_since of [null, undefined, '', 'not a date']) {
      expect(needsYou(ROW({ status: 'occupied', current_sale_id: null, occupied_since })), String(occupied_since)).toBe(false)
    }
  })

  it('falls back to seated_at when occupied_since is absent', () => {
    expect(needsYou(ROW({ status: 'occupied', current_sale_id: null, seated_at: minsAgo(45) }))).toBe(true)
  })

  it('seatedMinutes reports unknown as null, never 0', () => {
    expect(seatedMinutes(ROW())).toBeNull()
    expect(seatedMinutes(ROW({ occupied_since: minsAgo(7) }))).toBe(7)
  })
})

describe('VENUE-VIEW-1 · the dot colour follows the rule, and all three are reachable', () => {
  it('red for NEEDS-YOU, orange for busy, green for free', () => {
    const red = dotColour(ROW({ status: 'occupied', current_sale_id: null, occupied_since: minsAgo(60) }))
    const orange = dotColour(ROW({ status: 'occupied', current_sale_id: 'sale-1' }))
    const green = dotColour(ROW({ status: 'available' }))
    expect(red).toBe('#e03a2f')
    expect(orange).toBe('#f26b1d')
    expect(green).toBe('#22a06b')
    // ⚠️ Anti-vacuity: three DISTINCT colours. A dotColour() returning one constant would otherwise
    // satisfy any single one of these assertions.
    expect(new Set([red, orange, green]).size).toBe(3)
  })

  it('reserved reads busy, cleaning reads free', () => {
    expect(dotColour(ROW({ status: 'reserved' }))).toBe('#f26b1d')
    expect(dotColour(ROW({ status: 'cleaning' }))).toBe('#22a06b')
  })

  it('⚠️ the legacy FloorPlan status words still read busy, not free', () => {
    // pre-flight note 7: FloorPlan.tsx types status as seated|ordering|eating|check|dirty, a
    // different vocabulary from the DB set this sprint was given. An old row must not show a green
    // dot over four seated guests.
    for (const status of ['seated', 'ordering', 'eating', 'check']) {
      expect(dotColour(ROW({ status })), status).toBe('#f26b1d')
    }
  })

  it('an unknown status word reads free rather than throwing', () => {
    expect(dotColour(ROW({ status: 'something-new' }))).toBe('#22a06b')
    expect(dotColour(ROW({ status: null }))).toBe('#22a06b')
  })
})

describe('VENUE-VIEW-1 · labels and scale', () => {
  it('PX_TO_M is the pixel-to-metre scale, exported as a constant', () => {
    expect(PX_TO_M).toBe(0.08)
    // A 800px-wide room is 64 m — the prototype's own W = 800 * PX.
    expect(800 * PX_TO_M).toBeCloseTo(64)
  })

  it('rowLabel prefers display_name, then name, then says so', () => {
    expect(rowLabel(ROW({ display_name: 'Window 2', name: 'T1' }))).toBe('Window 2')
    expect(rowLabel(ROW({ display_name: null, name: 'T1' }))).toBe('T1')
    expect(rowLabel(ROW({ display_name: null, name: null }))).toBe('Unnamed table')
  })

  it('rowZone prefers zone, then section, then seating_area, else empty', () => {
    expect(rowZone(ROW({ zone: 'Patio', section: 'Main' }))).toBe('Patio')
    expect(rowZone(ROW({ section: 'Main' }))).toBe('Main')
    expect(rowZone(ROW({ seating_area: 'Bar' }))).toBe('Bar')
    expect(rowZone(ROW())).toBe('')
  })
})

describe('VENUE-VIEW-1 · the constraints this file is held to', () => {
  /** Comments stripped — a scan that reads its own prose as code gets loosened until it stops firing. */
  const read = (f: string) =>
    readFileSync(join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const code = read('VenueView3D.tsx')
  const rules = read('venue-rules.ts')

  it('⚠️ THE OUTER MODULE IMPORTS NOTHING FROM three/fiber/drei', () => {
    // The whole point of the dynamic factory: three must not reach the server render or the initial
    // bundle. A plain top-level `import ... from 'three'` would break SSR on the bookings page.
    const topLevel = code.match(/^import[\s\S]*?from\s+['"][^'"]+['"]/gm) ?? []
    for (const line of topLevel) {
      expect(line, 'a top-level import pulls in three: ' + line).not.toMatch(/three|@react-three/)
    }
    expect(topLevel.length, 'no top-level imports found — the scan is reading the wrong thing').toBeGreaterThan(0)
  })

  it('⚠️ ALL THREE MODULES ARE LOADED IN ONE Promise.all, THE APPROVED PATTERN', () => {
    expect(code).toMatch(/Promise\.all\(\[\s*import\('@react-three\/fiber'\),\s*import\('@react-three\/drei'\),\s*import\('three'\),?\s*\]\)/)
    expect(code).toMatch(/ssr:\s*false/)
  })

  it('⚠️ NO VARIABLE IS NAMED `top` — it clashes with window.top at module scope', () => {
    expect(code).not.toMatch(/\b(const|let|var)\s+top\b/)
  })

  it('⚠️ THE CANVAS GETS AN EXPLICIT SIZE — without it three renders at 300x150', () => {
    expect(code).toMatch(/width:\s*'100%',\s*height:\s*'100%'/)
  })

  it('⚠️ NO CALLER-SUPPLIED business_id IS SENT — the route resolves it from the session', () => {
    // RULE 7. Honouring a business_id query param here would be a cross-business leak, and the
    // route ignores the param anyway (pre-flight note 8).
    const fetches = code.match(/fetch\([^)]*\)/g) ?? []
    expect(fetches.length, 'no fetch call found — the scan is reading the wrong thing').toBeGreaterThan(0)
    for (const f of fetches) expect(f, 'a fetch sends a business_id: ' + f).not.toMatch(/business_id/)
  })

  it('⚠️ EVERY DOLLAR GOES THROUGH (Number(x)||0).toFixed(2)', () => {
    expect(rules).toMatch(/\(Number\([a-zA-Z]+\)\s*\|\|\s*0\)\.toFixed\(2\)/)
  })

  it('⚠️ THE POLL IS CLEARED ON UNMOUNT — a 20s interval left running is a leak', () => {
    expect(code).toMatch(/setInterval\(\s*run,\s*20_000\s*\)/)
    expect(code).toMatch(/clearInterval/)
  })

  it('⚠️ THE SCENE IS NOT REBUILT ON EVERY POLL — the effect is keyed on the signature, not `rows`', () => {
    // The poll hands down a new array every 20s. An effect keyed on `rows` rebuilds every mesh three
    // times a minute: visible flicker, and hundreds of geometries churned for an unchanged payload.
    expect(code).toMatch(/\}, \[sig, scene, camera\]\)/)
    expect(code, 'the world-build effect is keyed on `rows` again').not.toMatch(/\}, \[rows, scene, camera\]\)/)
  })

  it('⚠️ THE SIGNATURE INCLUDES THE NEEDS-YOU VERDICT — or a dot never turns red while you watch', () => {
    // Without it, a table crossing the 20-minute line produces an identical signature (occupied_since
    // has not changed) and the dot stays orange until something else about the row changes.
    const start = code.indexOf('const sig = rows.map')
    expect(start, 'the signature was not found').toBeGreaterThan(-1)
    const body = code.slice(start, code.indexOf(".join('|')", start))
    expect(body).toMatch(/needsYou\(r\)/)
    expect(body).toMatch(/r\.status/)
  })

  it('⚠️ THE CAMERA IS FRAMED ONCE, BEHIND A GUARD — not on every rebuild', () => {
    // Re-framing on rebuild throws the owner back to the default angle whenever a table changes
    // state, while they are looking at it.
    expect(code).toMatch(/if \(!homedRef\.current\)/)
    const start = code.indexOf('if (!homedRef.current)')
    const guarded = code.slice(start, start + 400)
    expect(guarded, 'camera.position.set is not inside the homed guard').toMatch(/camera\.position\.set/)
  })
})
