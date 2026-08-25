/**
 * S1 PHASE 8 — RENDER VERIFICATION, IN A REAL BROWSER.
 *
 * The three things the phase asks to be proven, proven against actual DOM rather than source:
 *   1. a stream that cuts mid-table then completes ends as a REAL table, with no error
 *   2. an injected script does NOT execute
 *   3. provenance survives the renderer — figures keep their tier and their click-to-source
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

/** The mid-stream cut, and the same answer completed. */
const MID_TABLE = 'Steady week — **$14,208** across 612 sales.\n\n| Day | Takings |'
const COMPLETE = [
  'Steady week — **$14,208** across 612 sales.',
  '',
  '| Day | Takings |',
  '| --- | ------: |',
  '| Mon | $1,204  |',
  '| Sat | $3,980  |',
  '',
  '```sql',
  'select sum(total_amount) from pos_sales;',
  '```',
].join('\n')

/** Model output doing the worst thing it can do. */
const HOSTILE = [
  'Here is your summary.',
  '',
  '<script>window.__PWNED = true;</script>',
  '<img src=x onerror="window.__PWNED_IMG = true">',
  '',
  '[a link](javascript:window.__PWNED_HREF=true)',
].join('\n')

const PROV = { anchors: [14208], anchorLabels: { '14208': 'Completed sales, 18-24 Aug.' } }

function page(bodies: Array<{ id: string; html: string }>) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>' + appCss + '</style><style>' + axCss + '</style></head><body>'
    + bodies.map(b => '<div id="' + b.id + '" class="bub">' + b.html + '</div>').join('\n')
    + '</body></html>'
}

const MID_PROBE = '(function(){'
  + 'var el = document.querySelector("#mid");'
  + 'return { tables: el.querySelectorAll("table").length, pipes: (el.innerText.match(/\\|/g)||[]).length };'
  + '})()'

const DONE_PROBE = '(function(){'
  + 'var el = document.querySelector("#done"); var t = el.querySelector("table");'
  + 'return { tables: el.querySelectorAll("table").length,'
  + ' rows: t ? t.querySelectorAll("tr").length : 0,'
  + ' cells: t ? t.querySelectorAll("td").length : 0,'
  + ' headers: t ? t.querySelectorAll("th").length : 0,'
  + ' code: el.querySelectorAll("pre code").length,'
  + ' copyBtn: el.querySelectorAll(".ax-code-copy").length,'
  + ' pipes: (el.innerText.match(/\\|/g)||[]).length };'
  + '})()'

const HOSTILE_PROBE = '(function(){'
  + 'var el = document.querySelector("#hostile");'
  + 'return { pwned: !!window.__PWNED, pwnedImg: !!window.__PWNED_IMG, pwnedHref: !!window.__PWNED_HREF,'
  + ' scripts: el.querySelectorAll("script").length, imgs: el.querySelectorAll("img").length,'
  + ' jsHrefs: Array.prototype.filter.call(el.querySelectorAll("a"), function(a){'
  + '   return (a.getAttribute("href")||"").toLowerCase().indexOf("javascript:") === 0; }).length,'
  + ' showsAsText: el.innerText.indexOf("<script>") >= 0 };'
  + '})()'

const PROV_PROBE = '(function(){'
  + 'var el = document.querySelector("#done");'
  + 'return { figures: el.querySelectorAll(".n2").length,'
  + ' openPanels: el.querySelectorAll(".src.on").length,'
  + ' panelText: (el.querySelector(".src.on")||{}).textContent || "" };'
  + '})()'

async function run() {
  const lines: string[] = []
  let failures = 0
  const fail = (m: string) => { failures++; lines.push('  X ' + m) }
  const ok = (m: string) => lines.push('  OK ' + m)
  lines.push('S1 PHASE 8 — RENDER VERIFICATION')

  const render = (text: string, streaming: boolean, idPrefix: string, prov?: object) =>
    renderToStaticMarkup(React.createElement(AnswerMarkdown, {
      text, streaming, idPrefix, openSrc: idPrefix + ':0', onToggleSrc: () => {},
      provenance: prov as never,
    }))

  const browser = await chromium.launch()
  const p = await browser.newPage({ viewport: { width: 900, height: 900 } })

  await p.setContent(page([
    { id: 'mid', html: render(MID_TABLE, true, 'a', PROV) },
    { id: 'done', html: render(COMPLETE, false, 'b', PROV) },
    { id: 'hostile', html: render(HOSTILE, false, 'c') },
  ]))
  await p.waitForTimeout(500)

  const mid = await p.evaluate(MID_PROBE) as { tables: number; pipes: number }
  lines.push('')
  lines.push('=== 1. a stream that cuts mid-table ===')
  lines.push('  ' + JSON.stringify(mid))
  if (mid.tables === 0) ok('no half-built table rendered mid-stream')
  else fail('a broken table rendered mid-stream')
  if (mid.pipes === 0) ok('the incomplete pipe row is withheld — no raw pipes flash on screen')
  else fail('raw pipes visible mid-stream (' + mid.pipes + ')')

  const done = await p.evaluate(DONE_PROBE) as Record<string, number>
  lines.push('')
  lines.push('=== 2. the completed answer ===')
  lines.push('  ' + JSON.stringify(done))
  if (done.tables === 1) ok('a REAL table element, not pipes-and-dashes')
  else fail('expected 1 table, got ' + done.tables)
  if (done.headers === 2 && done.cells === 4) ok('2 header cells and 4 body cells, correctly parsed')
  else fail('table shape wrong: ' + done.headers + ' th, ' + done.cells + ' td')
  if (done.pipes === 0) ok('no raw pipe characters survive into the rendered text')
  else fail(done.pipes + ' raw pipes still rendered')
  if (done.code === 1 && done.copyBtn === 1) ok('code block rendered with a copy button')
  else fail('code block/copy button missing (' + done.code + '/' + done.copyBtn + ')')

  const hostile = await p.evaluate(HOSTILE_PROBE) as Record<string, boolean | number>
  lines.push('')
  lines.push('=== 3. hostile model output ===')
  lines.push('  ' + JSON.stringify(hostile))
  if (!hostile.pwned && !hostile.pwnedImg && !hostile.pwnedHref) ok('NOTHING executed — no global was set')
  else fail('MODEL OUTPUT EXECUTED')
  if (hostile.scripts === 0) ok('no script element was created at all')
  else fail(hostile.scripts + ' script elements created')
  if (hostile.imgs === 0) ok('no img element was created, so onerror could not fire')
  else fail(hostile.imgs + ' img elements created')
  if (hostile.jsHrefs === 0) ok('no javascript: href survived')
  else fail(hostile.jsHrefs + ' javascript: hrefs survived')
  if (hostile.showsAsText) ok('the tags are shown to the owner as literal text, which is honest')

  const prov = await p.evaluate(PROV_PROBE) as Record<string, number | string>
  lines.push('')
  lines.push('=== 4. provenance through the renderer ===')
  lines.push('  ' + JSON.stringify(prov))
  if ((prov.figures as number) >= 1) ok('the verified figure kept its truth-tier marker')
  else fail('PROVENANCE LOST — no figure marker survived the renderer')
  if ((prov.openPanels as number) >= 1 && String(prov.panelText).indexOf('Completed sales') >= 0) {
    ok('click-to-source still resolves to the real anchor label')
  } else fail('click-to-source did not survive')

  await p.screenshot({ path: join(OUT, 's1-render.png') })
  await p.close()
  await browser.close()

  lines.push('')
  lines.push(failures === 0 ? 'RENDERING VERIFIED' : failures + ' FAILURE(S)')
  const report = lines.join('\n')
  console.log(report)
  writeFileSync(join(OUT, 's1-render-report.txt'), report)
  if (failures > 0) process.exit(1)
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
