/**
 * MS16C PHASE 5 — THE PANEL AT REAL SIZES.
 *
 * Walks the surface at 1280 / 1440 / 1920 × 900, in both states, inside the DashboardShell's real
 * wrapper markup and beside the sidebar box. Every collision or overflow is REPORTED, never fixed by
 * editing a lifted rule.
 *
 * Same harness caveat as the leak check: the component, the lifted sheet and the compiled
 * application CSS are real; the Sidebar is a structural stand-in with the dashboard's own classes,
 * because the live one needs an authenticated session this environment does not have.
 */
import { chromium, type Page } from 'playwright'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import AskAriaTransition from '@/components/ask-aria-ax/AskAriaTransition'

const ROOT = 'C:/Users/kansa/aria-saas-audit'
const OUT = 'C:/Users/kansa/AppData/Local/Temp/claude/c--Users-kansa-aria-saas-audit/b24228f2-7b5b-4175-9f10-5c3c055b9acf/scratchpad'

const axCss = readFileSync(join(ROOT, 'src/styles/ask-aria-transition.css'), 'utf8')
const cssDir = join(ROOT, '.next/static/css')
const appCssFile = readdirSync(cssDir)
  .map(f => ({ f, size: readFileSync(join(cssDir, f)).length }))
  .sort((a, b) => b.size - a.size)[0]!
const appCss = readFileSync(join(cssDir, appCssFile.f), 'utf8')
const surface = renderToStaticMarkup(React.createElement(AskAriaTransition))

function page(work: boolean) {
  const body = work ? surface.replace('class="ax-surface"', 'class="ax-surface work"') : surface
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${appCss}</style><style>${axCss}</style></head><body>
<div class="flex h-screen bg-[#0f0f13] overflow-hidden">
  <div class="hidden md:block flex-shrink-0"><div id="sidebar" class="w-[220px] flex-shrink-0 bg-black h-screen"></div></div>
  <div class="flex-1 flex flex-col overflow-hidden min-w-0">
    <main id="content" class="flex-1 relative overscroll-contain overflow-hidden">${body}</main>
  </div>
</div></body></html>`
}

interface Box { x: number; y: number; w: number; h: number }
const boxOf = `(function(sel){var e=document.querySelector(sel);if(!e)return null;var r=e.getBoundingClientRect();
  return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)};})`
const measure = (p: Page, sel: string) => p.evaluate(`${boxOf}(${JSON.stringify(sel)})`) as Promise<Box | null>

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

async function run() {
  const browser = await chromium.launch()
  const lines: string[] = []
  const findings: string[] = []
  const note = (m: string) => lines.push('  ' + m)
  const finding = (m: string) => { findings.push(m); lines.push('  ⚠ FINDING: ' + m) }
  const ok = (m: string) => lines.push('  ✓ ' + m)

  lines.push('MS16C PHASE 5 — THE PANEL AT REAL SIZES (height 900 throughout)')

  for (const width of [1280, 1440, 1920]) {
    for (const work of [false, true]) {
      const state = work ? 'working' : 'welcome'
      const p = await browser.newPage({ viewport: { width, height: 900 } })
      await p.setContent(page(work))
      await p.waitForTimeout(700)

      lines.push('')
      lines.push(`═══ ${width}×900 · ${state} ═══`)

      const surfaceBox = await measure(p, '.ax-surface')
      const nav = await measure(p, '.nav')
      const orbit = await measure(p, '.orbit')
      const newbtn = await measure(p, '.newbtn')
      if (!surfaceBox) { finding('no surface'); await p.close(); continue }
      note(`surface ${JSON.stringify(surfaceBox)}`)

      // ── the rooms pill vs the corona ────────────────────────────────────────────────────────
      if (nav && orbit) {
        note(`nav ${JSON.stringify(nav)}  orbit ${JSON.stringify(orbit)}`)
        if (overlaps(nav, orbit)) {
          const gap = (orbit.y - (nav.y + nav.h)).toFixed(1)
          finding(`${width}×900 ${state}: the rooms pill COLLIDES with the corona (vertical gap ${gap}px)`)
        } else {
          ok(`rooms pill clears the corona by ${(orbit.y - (nav.y + nav.h)).toFixed(1)}px`)
        }
      }
      if (nav && newbtn && overlaps(nav, newbtn)) finding(`${width}×900 ${state}: rooms pill overlaps "New chat"`)

      // ── everything stays inside the surface horizontally ─────────────────────────────────────
      for (const sel of ['.nav', '.newbtn', '.stage', '.hero', '.talk', '.back']) {
        const b = await measure(p, sel)
        if (!b || b.w === 0) continue
        if (b.x < surfaceBox.x - 0.6 || b.x + b.w > surfaceBox.x + surfaceBox.w + 0.6) {
          finding(`${width}×900 ${state}: ${sel} sits outside the surface horizontally ${JSON.stringify(b)}`)
        }
      }

      // ── scrolling: the conversation scrolls internally, the page does not ────────────────────
      const scroll = await p.evaluate(`(function(){
        var f=document.querySelector('.flow');
        var d=document.documentElement, b=document.body;
        return {
          flowScrollable: f ? (getComputedStyle(f).overflowY==='auto'||getComputedStyle(f).overflowY==='scroll') : null,
          flowScrollH: f? f.scrollHeight:0, flowClientH: f? f.clientHeight:0,
          bodyScrollH: b.scrollHeight, bodyClientH: b.clientHeight,
          docScrollW: d.scrollWidth, innerW: window.innerWidth
        };
      })()`) as Record<string, number | boolean | null>

      if (scroll.flowScrollable === true) ok('conversation scrolls internally (.flow overflow-y auto)')
      else if (scroll.flowScrollable === null) note('.flow not present in this state')
      else finding(`${width}×900 ${state}: .flow does not scroll internally`)

      if ((scroll.bodyScrollH as number) <= (scroll.bodyClientH as number) + 1) ok('page does not scroll vertically')
      else finding(`${width}×900 ${state}: PAGE SCROLLS — body ${scroll.bodyScrollH} > ${scroll.bodyClientH}`)

      if ((scroll.docScrollW as number) <= (scroll.innerW as number) + 1) ok('no horizontal overflow')
      else finding(`${width}×900 ${state}: HORIZONTAL OVERFLOW — ${scroll.docScrollW} > ${scroll.innerW}`)

      // ── the composer must be reachable on screen ─────────────────────────────────────────────
      const composer = await measure(p, work ? '.box' : '.bigask')
      if (composer && composer.h > 0) {
        const bottom = composer.y + composer.h
        if (bottom > 900 + 0.6) finding(`${width}×900 ${state}: composer bottom ${bottom.toFixed(1)}px is below the fold`)
        else if (composer.y < 0) finding(`${width}×900 ${state}: composer top ${composer.y}px is above the viewport`)
        else ok(`composer on screen (${composer.y.toFixed(1)}→${bottom.toFixed(1)}px)`)
      } else {
        note(`composer for ${state} has zero height (collapsed by the contract in this state)`)
      }

      await p.screenshot({ path: join(OUT, `size-${width}-${state}.png`) })
      await p.close()
    }
  }

  // ── the label-collapse breakpoint the brief expects ───────────────────────────────────────────
  lines.push('')
  lines.push('═══ the 1120px label-collapse rule ═══')
  if (axCss.includes('1120px')) {
    lines.push('  the lifted sheet carries a 1120px rule')
  } else {
    finding('the contract has NO 1120px breakpoint — the rooms-pill labels never collapse to icons. '
      + 'Its only breakpoint is 1180px, which hides .hero in working mode. Not built, because '
      + 'writing one would mean authoring the design.')
  }

  await browser.close()
  lines.push('')
  lines.push(findings.length === 0 ? 'NO COLLISIONS OR OVERFLOWS FOUND' : `${findings.length} FINDING(S):`)
  for (const f of findings) lines.push('  · ' + f)
  const report = lines.join('\n')
  console.log(report)
  writeFileSync(join(OUT, 'size-walk-report.txt'), report)
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
