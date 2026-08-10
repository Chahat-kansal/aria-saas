import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// ARIA-FIX-ASSETS-1 §4 — THE RAIL.
//
// WHY THIS EXISTS: a referenced static asset can 404 in production with a green build, green tsc,
// green tests, and no error anywhere an operator would ever see. /pos-sfx/new-order.mp3 was
// referenced from the till and the kitchen, was never once committed to this repo, and 404'd in
// production for an unknown period. Nothing surfaced it — `new Audio(...).play()` rejects into a
// .catch that logs "[non-fatal]", and because the Audio object is never appended to the DOM no
// error event bubbles anywhere. It was found by a human noticing the shop had gone quiet.
//
// A build step would not have helped: the build WAS green. This is a test because this repo's
// suite already gates the push hook, which is the only place that reliably stops a regression here.

const ASSET_EXT = 'mp3|wav|ogg|m4a|webm|mp4|woff2?|ttf|otf|png|jpe?g|svg|gif|glb|gltf|ico|pdf'

/** Bare absolute asset paths in a string literal: '/foo/bar.png'. */
const ASSET_LITERAL = new RegExp("['\"`](/[A-Za-z0-9_./@-]+\\.(?:" + ASSET_EXT + "))['\"`]", 'g')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(p)) out.push(p)
  }
  return out
}

// ── THE ALLOWLIST ────────────────────────────────────────────────────────────────────────────────
// Paths that are STILL BROKEN and knowingly shipped. Seeded so the suite is green today.
//
// EVERY LINE REMOVED FROM HERE IS A FIX THAT CAN NEVER SILENTLY REGRESS. That is the entire point:
// this list only ever shrinks, and once a path leaves it, re-breaking it turns the suite red.
// Do NOT add to it to make a failure go away — add the asset, or delete the reference.
const KNOWN_MISSING = new Set<string>([
  // The five drink-vessel models never existed. public/menu/_lib/models/ holds ten .glb files,
  // none with these names.
  //
  // ZERO USER IMPACT TODAY, and the reason matters: drinkFills.ts:183 PRODUCES `modelPath` from
  // these, but nothing anywhere READS it. The only two importers of drinkFills (ProductView.tsx,
  // dev/coffee-360) take resolveCoffeeSpin/resolveCoffeeBgMode and render Spin360Viewer — 360-frame
  // image spins — never a GLB loader. So nothing ever requests these URLs; they are vestigial
  // config from the superseded 3D approach, not a live 404.
  // Allowlisted rather than deleted because removing VESSEL_PATH is a decision about whether the
  // GLB approach is dead for good, which is not this sprint's to make (RULE 0).
  '/menu/_lib/models/cup-hot-dinein.glb',
  '/menu/_lib/models/cup-hot-takeaway.glb',
  '/menu/_lib/models/glass-iced-dinein.glb',
  '/menu/_lib/models/cup-iced-takeaway.glb',
  '/menu/_lib/models/smoothie.glb',
])

/**
 * Drop comment lines.
 *
 * A path MENTIONED in a comment is not a reference. Both exclusions below were found by running
 * this rail against its own repo, not predicted: the first draft flagged /pos-sfx/new-order.mp3
 * because the commit that REMOVED it quotes the old path in an explanatory comment.
 *
 * Line-based on purpose. Stripping `//` anywhere would corrupt every 'https://' literal in the
 * codebase, which is a much worse failure than missing a path buried at the end of a code line.
 */
function stripComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
    })
    .join('\n')
}

function collectReferences(): Map<string, string[]> {
  const refs = new Map<string, string[]>()
  for (const file of walk('src')) {
    // Skip this file — it quotes asset paths as data, which would otherwise flag itself.
    if (file.replace(/\\/g, '/').endsWith('src/lib/assets.test.ts')) continue
    const text = stripComments(readFileSync(file, 'utf8'))
    for (const m of text.matchAll(ASSET_LITERAL)) {
      // A literal preceded by `+` is a CONCATENATED SUFFIX, not a local path. upload-media builds
      //   'https://' + BUNNY_CDN + '/' + guid + '/play_720p.mp4'
      // and the tail really is a bare quoted literal — the earlier claim that the pattern excluded
      // these was WRONG, and this rail is what disproved it. Checked by inspection, not assumed.
      const before = text.slice(0, m.index ?? 0).trimEnd()
      if (before.endsWith('+')) continue
      const p = m[1]
      if (!refs.has(p)) refs.set(p, [])
      refs.get(p)!.push(file.replace(/\\/g, '/'))
    }
  }
  return refs
}

describe('every static asset referenced in src/ exists in public/', () => {
  const refs = collectReferences()

  it('POSITIVE CONTROL — the walker finds real references', () => {
    // Without this, a broken regex or wrong path makes every assertion below pass on an empty map.
    expect(refs.size).toBeGreaterThan(10)
    expect([...refs.keys()]).toContain('/og-default.png')
    expect([...refs.keys()]).toContain('/icons/icon-192.png')
  })

  it('POSITIVE CONTROL — public/ is where we think it is', () => {
    expect(existsSync(join('public', 'og-default.png'))).toBe(true)
  })

  it('no referenced asset is missing from public/', () => {
    const missing: string[] = []
    for (const [p, files] of refs) {
      if (KNOWN_MISSING.has(p)) continue
      if (!existsSync(join('public', p))) missing.push(p + '  <- ' + files.join(', '))
    }
    expect(missing, 'referenced but not in public/:\n  ' + missing.join('\n  ')).toEqual([])
  })

  it('the allowlist has not gone stale — every entry is still referenced AND still missing', () => {
    // Stops the list decaying into a record of things that no longer matter. If a path is fixed or
    // its reference deleted, this fails and forces the line out of the list.
    for (const p of KNOWN_MISSING) {
      expect(refs.has(p), p + ' is allowlisted but no longer referenced — remove it').toBe(true)
      expect(existsSync(join('public', p)), p + ' now EXISTS — remove it from KNOWN_MISSING').toBe(false)
    }
  })

  it('CDN suffixes are not mistaken for local assets', () => {
    // upload-media:61-62 builds Bunny CDN URLs by concatenation:
    //   'https://' + BUNNY_CDN + '/' + guid + '/play_720p.mp4'
    // These ARE bare quoted literals — the earlier claim that the pattern would not match them was
    // wrong, and this rail caught it on its first run. Excluded by the preceding-`+` check instead.
    expect([...refs.keys()]).not.toContain('/play_720p.mp4')
    expect([...refs.keys()]).not.toContain('/thumbnail.jpg')
  })

  it('the chime that started this is gone, not merely relocated', () => {
    // /pos-sfx/new-order.mp3 is now SFX.newOrder(), a Web Audio oscillator. No asset, so nothing
    // to 404. If anyone reintroduces the file reference without adding the file, the assertion
    // above catches it — this one catches reintroducing it at all.
    expect([...refs.keys()]).not.toContain('/pos-sfx/new-order.mp3')
  })
})
