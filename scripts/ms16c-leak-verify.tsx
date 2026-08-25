/**
 * MS16C PHASE 2 — THE SURFACE MUST NOT LEAK, IN EITHER DIRECTION.
 *
 * This is the check for exactly what broke on screen: decoration anchored to the viewport escaping
 * over the dashboard sidebar, the dashboard's dark theme and Cormorant bleeding into the surface,
 * and the two brand marks colliding.
 *
 * WHAT IS REAL HERE, AND WHAT IS NOT — read before trusting the numbers:
 *   REAL: the AskAriaTransition component (rendered via renderToStaticMarkup), the installed lifted
 *         stylesheet, the compiled application CSS from the last production build (Tailwind, the
 *         dashboard theme, aria-tokens), and the DashboardShell's exact wrapper markup, copied from
 *         src/components/dashboard/DashboardShell.tsx.
 *   NOT REAL: the Sidebar is a structural stand-in carrying the dashboard's own classes and its
 *         real 220px/black box, because the live Sidebar needs BusinessProvider, a Supabase session
 *         and next/navigation, and this environment has no authenticated browser session (.env is
 *         not readable here).
 *
 * That limitation does not weaken the leak question, because every way this sheet can reach the
 * dashboard is a GLOBAL rule — `*`, `body`, `button`, and `:root` custom properties — and those
 * apply to a stand-in exactly as they would to the real component. The leak-out test measures a
 * page with the sheet loaded against the identical page without it.
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

// The largest compiled CSS chunk from the last build carries Tailwind + the dashboard theme.
const cssDir = join(ROOT, '.next/static/css')
const appCssFile = readdirSync(cssDir)
  .map(f => ({ f, size: readFileSync(join(cssDir, f)).length }))
  .sort((a, b) => b.size - a.size)[0]!
const appCss = readFileSync(join(cssDir, appCssFile.f), 'utf8')

const surface = renderToStaticMarkup(React.createElement(AskAriaTransition))

/**
 * DashboardShell's wrapper markup, verbatim from the source (lines 51, 62-64, 92, 161).
 * The sidebar box uses the shell's own skeleton styling: w-[220px], bg-black, h-screen.
 */
function page(withAxSheet: boolean, work: boolean) {
  const body = work ? surface.replace('class="ax-surface"', 'class="ax-surface work"') : surface
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${appCss}</style>
${withAxSheet ? `<style>${axCss}</style>` : ''}
</head><body>
<div class="flex h-screen bg-[#0f0f13] overflow-hidden">
  <div class="hidden md:block flex-shrink-0">
    <div id="sidebar" class="w-[220px] flex-shrink-0 bg-black h-screen"></div>
  </div>
  <div class="flex-1 flex flex-col overflow-hidden min-w-0">
    <main id="content" class="flex-1 relative overscroll-contain overflow-hidden">
      ${withAxSheet ? body : ''}
    </main>
  </div>
</div>
</body></html>`
}

interface Box { x: number; y: number; w: number; h: number }

const boxOf = `(function(sel){
  var e=document.querySelector(sel); if(!e) return null; var r=e.getBoundingClientRect();
  return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)};
})`

async function measure(p: Page, sel: string): Promise<Box | null> {
  return p.evaluate(`${boxOf}(${JSON.stringify(sel)})`) as Promise<Box | null>
}

const DECO = ['.hill', '.blob.one', '.blob.two', '.blob.three', '.moire', '.streaks']

function contains(outer: Box, inner: Box, tol = 0.6): boolean {
  return inner.x >= outer.x - tol
    && inner.y >= outer.y - tol
    && inner.x + inner.w <= outer.x + outer.w + tol
    && inner.y + inner.h <= outer.y + outer.h + tol
}

async function run() {
  const browser = await chromium.launch()
  const lines: string[] = []
  let failures = 0
  const fail = (m: string) => { failures++; lines.push('  ✗ ' + m) }
  const pass = (m: string) => lines.push('  ✓ ' + m)

  lines.push('MS16C PHASE 2 — LEAK VERIFICATION')
  lines.push('application CSS: ' + appCssFile.f + ' (' + appCssFile.size + ' bytes)')

  for (const width of [1280, 1440, 1920]) {
    for (const work of [false, true]) {
      const state = work ? 'working' : 'welcome'
      const p = await browser.newPage({ viewport: { width, height: 900 } })
      await p.setContent(page(true, work))
      await p.waitForTimeout(700)

      lines.push('')
      lines.push(`═══ ${width}×900 · ${state} ═══`)

      const content = await measure(p, '#content')
      const surfaceBox = await measure(p, '.ax-surface')
      const sidebar = await measure(p, '#sidebar')
      if (!content || !surfaceBox || !sidebar) { fail('missing structural element'); await p.close(); continue }

      lines.push(`  sidebar   ${JSON.stringify(sidebar)}`)
      lines.push(`  content   ${JSON.stringify(content)}`)
      lines.push(`  surface   ${JSON.stringify(surfaceBox)}`)

      // (a) the surface fills the content area exactly
      const dx = Math.abs(content.x - surfaceBox.x), dy = Math.abs(content.y - surfaceBox.y)
      const dw = Math.abs(content.w - surfaceBox.w), dh = Math.abs(content.h - surfaceBox.h)
      const dmax = Math.max(dx, dy, dw, dh)
      if (dmax <= 1) pass(`surface fills the content area (Δmax ${dmax.toFixed(1)}px)`)
      else fail(`surface does NOT match the content area (Δmax ${dmax.toFixed(1)}px)`)

      // (b) NOTHING ESCAPES.
      //
      // MEASURED AS PAINTED PIXELS, NOT LAYOUT BOXES. The first version of this test used
      // getBoundingClientRect() and reported .hill and .moire as escaping at every width. That was
      // MY error, not a defect: a bounding box ignores clipping, and .ax-surface carries
      // overflow:hidden, so a box may extend past the surface while nothing paints there. The
      // contract deliberately oversizes .hill (left:-6%;width:112%) and .moire (1180px) and relies
      // on the surface to clip them.
      //
      // The honest question is whether anything from the surface PAINTS outside it. So: screenshot
      // the strip outside the surface with the surface mounted, and again with it absent, and
      // compare the PNG buffers byte-for-byte. Identical means nothing escaped — no decoder needed
      // and no tolerance to argue about.
      const clip = { x: 0, y: 0, width: Math.max(1, Math.round(surfaceBox.x)), height: 900 }
      const painted = await p.screenshot({ clip })

      const bare = await browser.newPage({ viewport: { width, height: 900 } })
      await bare.setContent(page(false, work))
      await bare.waitForTimeout(400)
      const baseline = await bare.screenshot({ clip })
      await bare.close()

      if (painted.equals(baseline)) {
        pass(`nothing paints outside the surface — the ${clip.width}px strip left of it is byte-identical`)
      } else {
        let diff = 0
        for (let i = 0; i < Math.min(painted.length, baseline.length); i++) if (painted[i] !== baseline[i]) diff++
        fail(`SURFACE PAINTS OUTSIDE ITSELF — ${diff} differing bytes in the ${clip.width}px strip`)
      }

      // the surface must actually be a clipping context, or the above passes for the wrong reason
      const clips = await p.evaluate(`(function(){var c=getComputedStyle(document.querySelector('.ax-surface'));
        return c.overflow+'|'+c.isolation+'|'+c.position})()`) as string
      if (clips.startsWith('hidden|isolate|relative')) pass(`surface clips and isolates (${clips})`)
      else fail(`surface is not a clipping/isolating context: ${clips}`)

      // layout boxes recorded as diagnostics only — deliberately NOT assertions
      for (const sel of DECO) {
        const b = await measure(p, sel)
        if (b && !contains(surfaceBox, b)) {
          lines.push(`  · ${sel} layout box extends past the surface (clipped by overflow:hidden) ${JSON.stringify(b)}`)
        }
      }

      // (c) the page must not scroll or grow
      const doc = await p.evaluate(`(function(){return {
        bodyScrollH: document.body.scrollHeight, bodyClientH: document.body.clientHeight,
        docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth
      }})()`) as { bodyScrollH: number; bodyClientH: number; docScrollW: number; innerW: number }
      if (doc.bodyScrollH <= doc.bodyClientH + 1) pass('body does not scroll vertically')
      else fail(`body scrolls: scrollHeight ${doc.bodyScrollH} > clientHeight ${doc.bodyClientH}`)
      if (doc.docScrollW <= doc.innerW + 1) pass('no horizontal overflow')
      else fail(`horizontal overflow: scrollWidth ${doc.docScrollW} > ${doc.innerW}`)

      // (d) NOTHING LEAKS IN — computed styles, not source
      const leakIn = await p.evaluate(`(function(){
        var host=document.querySelector('.ax-surface'); if(!host) return null;
        var els=[host].concat(Array.prototype.slice.call(host.querySelectorAll('*')));
        var cormorant=0, serif=0, sage=0, sageEg='', fontEg='';
        var SAGE=['rgb(127, 184, 151)','rgb(45, 82, 64)','rgb(90, 149, 119)','rgb(143, 202, 165)'];
        for (var i=0;i<els.length;i++){
          var c=getComputedStyle(els[i]);
          var ff=(c.fontFamily||'');
          if(/cormorant/i.test(ff)){cormorant++; if(!fontEg)fontEg=els[i].className+' :: '+ff}
          if(/fraunces|georgia|serif/i.test(ff) && !/sans-serif/i.test(ff)){serif++; if(!fontEg)fontEg=els[i].className+' :: '+ff}
          if(SAGE.indexOf(c.color)>=0||SAGE.indexOf(c.backgroundColor)>=0){sage++; if(!sageEg)sageEg=els[i].className+' :: '+c.color+' / '+c.backgroundColor}
        }
        return {count:els.length, cormorant:cormorant, serif:serif, sage:sage, sageEg:sageEg, fontEg:fontEg,
                hostFont:getComputedStyle(host).fontFamily};
      })()`) as { count: number; cormorant: number; serif: number; sage: number; sageEg: string; fontEg: string; hostFont: string } | null

      if (!leakIn) fail('could not read computed styles')
      else {
        lines.push(`  computed on ${leakIn.count} elements · host font: ${leakIn.hostFont}`)
        if (leakIn.cormorant === 0) pass('no Cormorant anywhere inside the surface')
        else fail(`Cormorant leaked into ${leakIn.cormorant} elements — e.g. ${leakIn.fontEg}`)
        if (leakIn.serif === 0) pass('no serif face inside the surface')
        else fail(`serif leaked into ${leakIn.serif} elements — e.g. ${leakIn.fontEg}`)
        if (leakIn.sage === 0) pass('no dashboard sage/deep-green inside the surface')
        else fail(`sage leaked into ${leakIn.sage} elements — e.g. ${leakIn.sageEg}`)
      }

      await p.screenshot({ path: join(OUT, `leak-${width}-${state}.png`) })
      await p.close()
    }
  }

  // (e) NOTHING LEAKS OUT — sidebar identical with the sheet and without it
  lines.push('')
  lines.push('═══ NOTHING LEAKS OUT — sidebar computed style, sheet mounted vs unmounted ═══')
  const probe = `(function(){
    var s=document.querySelector('#sidebar'); var r=s.getBoundingClientRect(); var c=getComputedStyle(s);
    var b=document.body; var cb=getComputedStyle(b);
    return {w:+r.width.toFixed(1), h:+r.height.toFixed(1), bg:c.backgroundColor, font:c.fontFamily,
            bodyMargin:cb.margin, bodyOverflow:cb.overflow, bodyHeight:cb.height};
  })()`
  for (const width of [1280, 1440, 1920]) {
    const withSheet = await browser.newPage({ viewport: { width, height: 900 } })
    await withSheet.setContent(page(true, false)); await withSheet.waitForTimeout(400)
    const a = await withSheet.evaluate(probe) as Record<string, unknown>
    await withSheet.close()

    const without = await browser.newPage({ viewport: { width, height: 900 } })
    await without.setContent(page(false, false)); await without.waitForTimeout(400)
    const b = await without.evaluate(probe) as Record<string, unknown>
    await without.close()

    lines.push(`  ${width}px  with: ${JSON.stringify(a)}`)
    lines.push(`  ${width}px  w/o : ${JSON.stringify(b)}`)
    for (const k of ['w', 'h', 'bg', 'font']) {
      if (a[k] === b[k]) pass(`${width}px sidebar ${k} identical (${String(a[k])})`)
      else fail(`${width}px sidebar ${k} CHANGED: ${String(b[k])} -> ${String(a[k])}`)
    }
    for (const k of ['bodyMargin', 'bodyOverflow', 'bodyHeight']) {
      if (a[k] === b[k]) pass(`${width}px ${k} identical (${String(a[k])})`)
      else lines.push(`  ! ${width}px ${k} changed: ${String(b[k])} -> ${String(a[k])}  [lifted body rule]`)
    }
  }

  await browser.close()
  lines.push('')
  lines.push(failures === 0 ? 'ALL LEAK ASSERTIONS PASSED' : `${failures} FAILURE(S)`)
  const report = lines.join('\n')
  console.log(report)
  writeFileSync(join(OUT, 'leak-report.txt'), report)
  if (failures > 0) process.exit(1)
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
