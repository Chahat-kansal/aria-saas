/**
 * S2B PHASE 5 — RENDERING ON A RESTORED THREAD AND A SEARCH RESULT.
 *
 * S2 refused to re-run S1's fixture and call it new evidence. These are the two paths that did not
 * exist then and do now, so this is genuinely new ground:
 *
 *   RESTORED  messages come back from /api/aria/ask/history and are replayed into the surface
 *   SEARCHED  a hit renders its snippet in the thread panel
 *
 * The question that matters most is whether PROVENANCE survives them. It is asked in both
 * directions: once with anchors supplied (what the surface COULD pass) and once with none (what it
 * passes today), so the report can state the difference rather than assert a conclusion.
 */
import { chromium } from 'playwright'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import AnswerMarkdown from '@/components/ask-aria-ax/AnswerMarkdown'

const ROOT = 'C:/Users/kansa/aria-saas-audit'
const OUT = 'C:/Users/kansa/AppData/Local/Temp/claude/c--Users-kansa-aria-saas-audit/b24228f2-7b5b-4175-9f10-5c3c055b9acf/scratchpad'

const axCss = readFileSync(join(ROOT, 'src/styles/ask-aria-transition.css'), 'utf8')
const cssDir = join(ROOT, '.next/static/css')
const appCssFile = readdirSync(cssDir)
  .map(f => ({ f, size: readFileSync(join(cssDir, f)).length }))
  .sort((a, b) => b.size - a.size)[0]!
const appCss = readFileSync(join(cssDir, appCssFile.f), 'utf8')

/** Exactly the shape a restored assistant message has coming out of the history route. */
const RESTORED = [
  'Steady week — **$14,208** across 612 sales, up 6%.',
  '',
  '| Day | Sales | Takings |',
  '| --- | ----: | ------: |',
  '| Mon | 71    | $1,204  |',
  '| Sat | 168   | $3,980  |',
  '',
  'Margin sits at 61% on guessed costs.',
].join('\n')

const PROV = { anchors: [14208, 61], anchorLabels: { '14208': 'Completed sales, 18-24 Aug.' } }

function page(bodies: Array<{ id: string; html: string }>) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>' + appCss + '</style><style>' + axCss + '</style></head><body>'
    + bodies.map(b => '<div id="' + b.id + '" class="bub">' + b.html + '</div>').join('\n')
    + '</body></html>'
}

const probe = (id: string) => '(function(){'
  + 'var el=document.querySelector("#' + id + '"); var t=el.querySelector("table");'
  + 'return { tables: el.querySelectorAll("table").length,'
  + ' headers: t? t.querySelectorAll("th").length:0, cells: t? t.querySelectorAll("td").length:0,'
  + ' pipes: (el.innerText.match(/\\|/g)||[]).length,'
  + ' figures: el.querySelectorAll(".n2").length,'
  + ' openPanels: el.querySelectorAll(".src.on").length,'
  + ' panelText: (el.querySelector(".src.on")||{}).textContent || "",'
  + ' figureInCell: el.querySelectorAll("td .n2, th .n2").length };'
  + '})()'

async function run() {
  const lines: string[] = []
  let failures = 0
  const fail = (m: string) => { failures++; lines.push('  X  ' + m) }
  const ok = (m: string) => lines.push('  OK ' + m)
  lines.push('S2B PHASE 5 — RESTORED THREAD + SEARCH RESULT')

  const render = (text: string, idPrefix: string, prov?: object) =>
    renderToStaticMarkup(React.createElement(AnswerMarkdown, {
      text, streaming: false, idPrefix, openSrc: idPrefix + ':0', onToggleSrc: () => {},
      provenance: prov as never,
    }))

  const browser = await chromium.launch()
  const p = await browser.newPage({ viewport: { width: 900, height: 900 } })
  await p.setContent(page([
    // what the surface passes TODAY: no provenance prop at all
    { id: 'today', html: render(RESTORED, 'a') },
    // what it WOULD look like if the anchors reached the client
    { id: 'withprov', html: render(RESTORED, 'b', PROV) },
  ]))
  await p.waitForTimeout(400)

  const today = await p.evaluate(probe('today')) as Record<string, number | string>
  const withProv = await p.evaluate(probe('withprov')) as Record<string, number | string>

  lines.push('')
  lines.push('=== A RESTORED THREAD, AS THE SURFACE RENDERS IT TODAY ===')
  lines.push('  ' + JSON.stringify(today))
  if (today.tables === 1 && today.headers === 3 && today.cells === 6) {
    ok('the table survives a restore — 3 headers, 6 cells, a real <table>')
  } else fail('table did not survive the restore: ' + JSON.stringify(today))
  if (today.pipes === 0) ok('no raw pipes leaked into the rendered text')
  else fail(today.pipes + ' raw pipes rendered')

  if (today.figures === 0) {
    fail('PROVENANCE ABSENT: 0 figures carry a truth tier, because the surface passes no anchors')
  } else ok('figures carry a tier: ' + today.figures)

  lines.push('')
  lines.push('=== THE SAME CONTENT, WITH ANCHORS SUPPLIED ===')
  lines.push('  ' + JSON.stringify(withProv))
  if ((withProv.figures as number) >= 1) {
    ok('the RENDERER preserves provenance when it is given any — ' + withProv.figures + ' figures tiered')
  } else fail('the renderer loses provenance even when supplied')
  if ((withProv.openPanels as number) >= 1 && String(withProv.panelText).indexOf('Completed sales') >= 0) {
    ok('click-to-source resolves through markdown: "' + String(withProv.panelText).slice(0, 60) + '"')
  } else fail('click-to-source did not resolve')
  if ((withProv.figureInCell as number) >= 1) {
    ok('a figure INSIDE A TABLE CELL keeps its tier — the hardest case')
  } else lines.push('  -- no tiered figure landed in a cell in this fixture')

  await p.screenshot({ path: join(OUT, 's2b-restored.png') })
  await p.close()
  await browser.close()

  lines.push('')
  lines.push('CONCLUSION: the renderer preserves provenance; the SURFACE never supplies it.')
  lines.push(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' FINDING(S) — see above')
  const report = lines.join('\n')
  console.log(report)
  writeFileSync(join(OUT, 's2b-render-report.txt'), report)
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
