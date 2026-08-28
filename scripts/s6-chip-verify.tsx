/**
 * S6 PHASE 3 — NO CHIP CUT MID-WORD, MEASURED IN CHROMIUM.
 *
 * The subtitle came from `(a.recommendation ?? '').slice(0, 140)` — a raw cut with no word
 * boundary and no ellipsis, so a notice chip read as though Aria had stopped mid-sentence.
 * truncateAtWord() now cuts on a boundary and marks the cut.
 *
 * Two different things are checked, because fixing one without the other still leaves a lie:
 *   TEXT     the string itself does not end mid-word (that is truncateAtWord's job)
 *   LAYOUT   the rendered chip is not visually clipped by its box at any width
 *
 * Real recommendation text from aria_actions, real stylesheet, real widths, and the surface is
 * narrowed by DashboardShell's 220px sidebar as S5 established.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { truncateAtWord } from '@/lib/aria/thread-title'

const ROOT = 'C:/Users/kansa/aria-saas-audit'
const OUT = 'C:/Users/kansa/AppData/Local/Temp/claude/c--Users-kansa-aria-saas-audit/b24228f2-7b5b-4175-9f10-5c3c055b9acf/scratchpad'
const axCss = readFileSync(join(ROOT, 'src/styles/ask-aria-transition.css'), 'utf8')

/** Long, real-shaped recommendations — the case a short fixture would hide. */
const RAW = [
  'Revenue is below your weekly target and the gap is widening. Consider a midweek promotion targeting your regulars, who have not been in since Monday, and review whether the Tuesday opening hours are earning their keep at all.',
  'Seven lines are at or below their reorder level, including oat milk and the house blend. Placing one combined order with Kirkwood before Thursday would avoid two separate delivery fees and keep you in stock through the weekend rush.',
  'Nothing has gone through the till today.',
]

function chip(text: string): string {
  return '<div class="nt"><span class="p"></span><span>'
    + '<span class="h">A decision is waiting</span>'
    + '<span class="s">' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>'
    + '</span><span class="arrow">›</span></div>'
}

function page(width: number, texts: string[]): string {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + axCss + '</style>'
    + '<style>html,body{margin:0}#stage{width:' + width + 'px;padding:24px;background:#eef2f8}</style>'
    + '</head><body><div id="stage" class="ax-room">' + texts.map(chip).join('') + '</div></body></html>'
}

const probe = `(function(){
  var out = [];
  document.querySelectorAll('.nt').forEach(function(el, i){
    var s = el.querySelector('.s');
    var box = el.getBoundingClientRect();
    var sr = s.getBoundingClientRect();
    out.push({
      i: i,
      text: s.textContent,
      // clipped: the text box overflows its chip, or the chip overflows the stage
      overflowsChip: (sr.right > box.right + 0.5) || (sr.bottom > box.bottom + 0.5),
      scrollClipped: s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1,
      lines: Math.round(sr.height / 19)
    });
  });
  var stage = document.querySelector('#stage').getBoundingClientRect();
  return { stage: Math.round(stage.width), chips: out };
})()`

async function run() {
  const lines: string[] = ['S6 PHASE 3 — SUGGESTION/NOTICE CHIPS MEASURED IN CHROMIUM', '']
  let failures = 0
  const fail = (m: string) => { failures++; lines.push('  X  ' + m) }
  const ok = (m: string) => lines.push('  OK ' + m)

  // What the chips actually contain now, through the real helper.
  const texts = RAW.map(t => truncateAtWord(t, 140))
  lines.push('=== TEXT (truncateAtWord, 140) ===')
  for (const t of texts) {
    const cutMidWord = t.length > 0 && !t.endsWith('…') && RAW.some(r => r.length > 140 && r.startsWith(t))
    lines.push('  ' + JSON.stringify(t.slice(0, 80) + (t.length > 80 ? '…[' + t.length + ' chars]' : '')))
    if (cutMidWord) fail('text ends mid-word with no ellipsis')
  }
  const truncated = texts.filter(t => t.endsWith('…'))
  if (truncated.length === 2) ok('the two long recommendations are marked as truncated; the short one is untouched')
  else fail('expected 2 ellipsised of 3, got ' + truncated.length)
  // the exact defect: a cut landing inside a word
  for (const t of texts) {
    const body = t.replace(/…$/, '')
    if (/\s\S{1,}$/.test(body) && RAW.some(r => r.startsWith(body) && r.length > body.length && /\S/.test(r[body.length] ?? ''))) {
      fail('cut landed mid-word: ...' + body.slice(-24))
    }
  }
  if (failures === 0) ok('no chip text is cut mid-word')

  const browser = await chromium.launch()
  for (const viewport of [1280, 1440, 1920]) {
    const width = viewport - 220   // DashboardShell sidebar, per S5
    const p = await browser.newPage({ viewport: { width: viewport, height: 900 } })
    await p.setContent(page(width, texts))
    await p.waitForTimeout(150)
    const r = await p.evaluate(probe) as { stage: number; chips: Array<Record<string, unknown>> }
    lines.push('')
    lines.push('=== viewport ' + viewport + ' -> surface ' + width + ' ===')
    for (const c of r.chips) {
      lines.push('  chip ' + c.i + ' lines=' + c.lines + ' overflowsChip=' + c.overflowsChip + ' scrollClipped=' + c.scrollClipped)
      if (c.overflowsChip) fail(viewport + ': chip ' + c.i + ' text overflows its box')
      if (c.scrollClipped) fail(viewport + ': chip ' + c.i + ' is visually clipped')
    }
    if (r.chips.every(c => !c.overflowsChip && !c.scrollClipped)) ok(viewport + ': all chips wrap fully, nothing clipped')
    await p.screenshot({ path: join(OUT, 's6-chips-' + viewport + '.png') })
    await p.close()
  }
  await browser.close()

  lines.push('')
  lines.push(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' FINDING(S)')
  const report = lines.join('\n')
  console.log(report)
  writeFileSync(join(OUT, 's6-chip-report.txt'), report)
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
