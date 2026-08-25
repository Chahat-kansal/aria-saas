/**
 * MS16 PHASE 2 — VISUAL PROOF.
 *
 * Renders the REAL component (AskAriaTransition) to static markup, drops it into a harness page
 * that loads the REAL installed stylesheet, and measures it in Chromium against the mockup at
 * 1440x900 in BOTH states.
 *
 * What this proves: the component's own markup, under the installed sheet, lands the four measured
 * elements in the same places as the contract, and the transition timing strings are identical.
 * What it does NOT prove: the authenticated live route with real fetched data — effects do not run
 * in static rendering, so the noticed cards are seeded from the mockup's own three so the vertical
 * centring is compared like for like. That limitation is stated in the run log rather than hidden.
 */
import { chromium } from 'playwright'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AskAriaTransition from '@/components/ask-aria-ax/AskAriaTransition'

const ROOT = 'C:/Users/kansa/aria-saas-audit'
const OUT = 'C:/Users/kansa/AppData/Local/Temp/claude/c--Users-kansa-aria-saas-audit/b24228f2-7b5b-4175-9f10-5c3c055b9acf/scratchpad'

const css = readFileSync(join(ROOT, 'src/styles/ask-aria-transition.css'), 'utf8')
const body = renderToStaticMarkup(React.createElement(AskAriaTransition))

// The mockup's three noticed cards, so the two pages are compared with equivalent content.
const CARDS = `
  <button class="nt"><span class="p"></span><span><span class="h">Oat milk runs out Thursday</span><span class="s">Nine left, 4.2 a day. Kirkwood need two days.</span></span><span class="arrow">→</span></button>
  <button class="nt"><span class="p b"></span><span><span class="h">Your margins aren't real yet</span><span class="s">72 of 76 costs are guessed from price.</span></span><span class="arrow">→</span></button>
  <button class="nt"><span class="p c"></span><span><span class="h">Tuesdays are down 18% since July</span><span class="s">Four weeks running. Nothing else moved.</span></span><span class="arrow">→</span></button>`

const harness = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
<style>/* harness only: the surface resolves height:100% against its parent, which in the app is
  the dashboard's <main>. Give both sides the same definite box so geometry is comparable. */
  html,body{height:100%;margin:0} body>.ax-surface{height:100%}</style>
</head><body>${body}
<script>
  // seed the noticed list to match the contract's content, and neutralise the loading placeholder
  var n = document.querySelector('.noticed');
  if (n) n.innerHTML = ${JSON.stringify(CARDS)};
  // the appended .rope control does not exist in the mockup; hide it for a like-for-like measure
  var r = document.querySelector('.rope'); if (r) r.style.display = 'none';
  // like-for-like text: the greeting length is real data (owner name, notice count) and would
  // otherwise make the headline wrap differently from the contract for reasons that are not layout
  var h = document.querySelector('.headline');
  if (h) h.innerHTML = 'Evening, Chahat. <em>Three things stood out.</em>';
  var t = document.querySelector('.tagline');
  if (t) t.textContent = "I've been watching your stock, your money and your people all day.";
</script></body></html>`

writeFileSync(join(OUT, 'harness.html'), harness)

const TARGETS = ['.orbit', '.headline', '.talk', '.hero']

async function measure(page: import('playwright').Page, label: string) {
  const boxes: Record<string, { x: number; y: number; w: number; h: number } | null> = {}
  for (const sel of TARGETS) {
    const el = await page.$(sel)
    const b = el ? await el.boundingBox() : null
    boxes[sel] = b ? { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } : null
  }
  // NOTE: passed as a STRING, not a function. tsx/esbuild injects a __name helper into compiled
  // arrow functions, which is not defined inside the page and makes page.evaluate throw.
  const timing = await page.evaluate(
    "(function(){var g=function(s){var e=document.querySelector(s);if(!e)return null;" +
    "var c=getComputedStyle(e);return {fn:c.transitionTimingFunction,dur:c.transitionDuration}};" +
    "return {stage:g('.stage'),orbit:g('.orbit')}})()",
  ) as { stage: { fn: string; dur: string } | null; orbit: { fn: string; dur: string } | null }
  return { label, boxes, timing }
}

async function run() {
  const browser = await chromium.launch()
  const results: Record<string, unknown> = {}

  for (const [name, url] of [
    ['mockup', 'file:///' + ROOT + '/docs/design/ask-aria-transition.html'],
    ['surface', 'file:///' + OUT.replace(/\\/g, '/') + '/harness.html'],
  ] as const) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(url)
    await page.waitForTimeout(1200)

    results[name + ':welcome'] = await measure(page, name + ':welcome')
    await page.screenshot({ path: join(OUT, name + '-welcome.png') })

    await page.evaluate("document.querySelector('.ax-surface').classList.add('work')")
    await page.waitForTimeout(1600)     // let the .85s transition settle
    results[name + ':working'] = await measure(page, name + ':working')
    await page.screenshot({ path: join(OUT, name + '-working.png') })

    await page.close()
  }

  await browser.close()

  // ── compare ────────────────────────────────────────────────────────────────────────────────
  const lines: string[] = []
  let worst = 0
  for (const state of ['welcome', 'working']) {
    const a = results['mockup:' + state] as any
    const b = results['surface:' + state] as any
    lines.push('')
    lines.push('=== ' + state.toUpperCase() + ' @1440x900 ===')
    for (const sel of TARGETS) {
      const m = a.boxes[sel], s = b.boxes[sel]
      if (!m || !s) { lines.push(`  ${sel.padEnd(10)} MISSING  mockup=${!!m} surface=${!!s}`); continue }
      const d = {
        x: Math.abs(m.x - s.x), y: Math.abs(m.y - s.y),
        w: Math.abs(m.w - s.w), h: Math.abs(m.h - s.h),
      }
      const max = Math.max(d.x, d.y, d.w, d.h)
      worst = Math.max(worst, max)
      lines.push(
        `  ${sel.padEnd(10)} mockup ${JSON.stringify(m).padEnd(46)} surface ${JSON.stringify(s).padEnd(46)} Δmax=${max.toFixed(1)}px ${max <= 2 ? 'OK' : 'DIFF'}`,
      )
    }
    lines.push(`  timing .stage  mockup ${JSON.stringify(a.timing.stage)}  surface ${JSON.stringify(b.timing.stage)}  ${JSON.stringify(a.timing.stage) === JSON.stringify(b.timing.stage) ? 'IDENTICAL' : 'DIFFERENT'}`)
    lines.push(`  timing .orbit  mockup ${JSON.stringify(a.timing.orbit)}  surface ${JSON.stringify(b.timing.orbit)}  ${JSON.stringify(a.timing.orbit) === JSON.stringify(b.timing.orbit) ? 'IDENTICAL' : 'DIFFERENT'}`)
  }
  lines.push('')
  lines.push('WORST DELTA ACROSS ALL FOUR ELEMENTS, BOTH STATES: ' + worst.toFixed(1) + 'px')

  const report = lines.join('\n')
  console.log(report)
  writeFileSync(join(OUT, 'visual-report.txt'), report)
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
