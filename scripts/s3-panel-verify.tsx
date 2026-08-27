/**
 * S3 PHASES 3 + 6 — THE PANEL, OBSERVED RATHER THAN REASONED ABOUT.
 *
 *   PHASE 3  Are rename and pin REACHABLE? S2B wired them, but the sprint's screenshot shows only
 *            a delete icon. If the row clips, the controls exist and cannot be clicked — the same
 *            outcome as never having built them.
 *   PHASE 6  Is the panel clipped at the right edge, and does it cover the conversation?
 *
 * ⚠️ HOW THIS MEASURES, AND ITS ONE LIMITATION, STATED UP FRONT.
 * ThreadsPanel fetches its own list in a useEffect, so a server render produces an empty shell —
 * useless for measuring rows. This harness therefore rebuilds the ROW MARKUP and measures it
 * against the REAL stylesheet. To stop the harness drifting from the component it stands in for,
 * assertStructureMatchesComponent() parses ThreadsPanel.tsx and fails if the class names or the
 * per-row control count no longer match. It measures real CSS against verified-real structure; it
 * is NOT a running instance of the component, and phase 7 is where a real one gets clicked.
 *
 * Titles are the REAL ones from aria_conversations (including the 60-character row). A short
 * invented fixture would hide exactly the overflow being investigated.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'C:/Users/kansa/aria-saas-audit'
const OUT = 'C:/Users/kansa/AppData/Local/Temp/claude/c--Users-kansa-aria-saas-audit/b24228f2-7b5b-4175-9f10-5c3c055b9acf/scratchpad'

const axCss = readFileSync(join(ROOT, 'src/styles/ask-aria-transition.css'), 'utf8')
const panelSrc = readFileSync(join(ROOT, 'src/components/ask-aria-ax/rooms/ThreadsPanel.tsx'), 'utf8')

const THREADS = [
  { title: 'Tell me about "Briefing pipeline stalled — only 0 rows writt', sub: '2 messages · 25 Aug', pinned: true },
  { title: 'Tell me about "53 Aria recommendations pending review"', sub: '2 messages · 24 Aug', pinned: false },
  { title: 'Revenue Shortfall Analysis', sub: '2 messages · 23 Aug', pinned: false },
  { title: 'Briefing pipeline stalled — only 0 rows written in last 24h', sub: '4 messages · 22 Aug', pinned: false },
]

/** Fails loudly if the harness no longer reflects the component it is standing in for. */
function assertStructureMatchesComponent(): string[] {
  const notes: string[] = []
  const need = ['ax-threads', 'ax-threads-h', 'ax-thread-open', 'ax-thread', 'ax-thread-search']
  for (const cls of need) {
    if (!panelSrc.includes(cls)) throw new Error('harness drift: component no longer uses .' + cls)
  }
  // three per-row controls: pin, rename, delete
  const rowControls = (panelSrc.match(/aria-label=\{t\.pinned_at \? 'Unpin' : 'Pin'\}/g) ?? []).length
    + (panelSrc.match(/aria-label=\{'Rename '/g) ?? []).length
    + (panelSrc.match(/aria-label=\{'Delete '/g) ?? []).length
  if (rowControls !== 3) throw new Error('harness drift: expected 3 per-row controls, source has ' + rowControls)
  notes.push('structure verified against ThreadsPanel.tsx: 3 per-row controls (Pin, Rename, Delete)')
  return notes
}

function row(t: typeof THREADS[number]): string {
  return '<div class="ax-thread">'
    + '<button class="ax-thread-open"><span class="t">' + (t.pinned ? '📌 ' : '') + t.title + '</span>'
    + '<span class="s">' + t.sub + '</span></button>'
    + '<button class="cb" aria-label="' + (t.pinned ? 'Unpin' : 'Pin') + '">' + (t.pinned ? '📌' : '📍') + '</button>'
    + '<button class="cb" aria-label="Rename">✎</button>'
    + '<button class="cb" aria-label="Delete">🗑</button>'
    + '</div>'
}

function page(width: number): string {
  const panel = '<div class="ax-threads" role="dialog" aria-label="Your threads">'
    + '<div class="ax-threads-h"><b>Your threads</b><button class="cb" aria-label="Close">✕</button></div>'
    + '<input class="ax-thread-search" placeholder="Search your conversations…"/>'
    + THREADS.map(row).join('')
    + '</div>'
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + axCss + '</style>'
    + '<style>html,body{margin:0}#stage{width:' + width + 'px;height:820px;position:relative}</style></head><body>'
    + '<div id="stage"><div class="ax-surface">'
    + '<div class="ax-room" id="conversation" style="position:absolute;inset:64px 26px 26px 26px;background:#f6f8fb">'
    + '<div class="bub">A conversation is underneath this panel.</div></div>'
    + panel
    + '</div></div></body></html>'
}

const probe = `(function(){
  var stage = document.querySelector('#stage').getBoundingClientRect();
  var panel = document.querySelector('.ax-threads');
  var p = panel.getBoundingClientRect();
  var controls = [].slice.call(panel.querySelectorAll('.ax-thread .cb'));
  var conv = document.querySelector('#conversation').getBoundingClientRect();
  function clipped(el){
    var r = el.getBoundingClientRect();
    return (r.right > p.right + 0.5) || (r.left < p.left - 0.5) || (r.right > stage.right + 0.5) || (r.width < 1);
  }
  var widths = controls.map(function(c){ return c.getBoundingClientRect().width; });
  var overlapW = Math.max(0, Math.min(p.right, conv.right) - Math.max(p.left, conv.left));
  var overlapH = Math.max(0, Math.min(p.bottom, conv.bottom) - Math.max(p.top, conv.top));
  return {
    stage_w: Math.round(stage.width),
    panel_left: Math.round(p.left), panel_right: Math.round(p.right), panel_w: Math.round(p.width),
    gap_to_viewport_right: Math.round(stage.right - p.right),
    overflows_stage: p.right > stage.right + 0.5,
    control_count: controls.length,
    controls_clipped: controls.filter(clipped).length,
    controls_squashed: widths.filter(function(w){ return w < 30; }).length,
    narrowest_control_w: widths.length ? Math.round(Math.min.apply(null, widths)) : 0,
    covers_conversation_pct: Math.round(100 * (overlapW * overlapH) / (conv.width * conv.height)),
    titles_ellipsised: [].slice.call(panel.querySelectorAll('.ax-thread-open .t')).filter(function(t){
      return t.scrollWidth > t.clientWidth + 1;
    }).length
  };
})()`

async function run() {
  const lines: string[] = ['S3 PHASES 3 + 6 — PANEL MEASURED IN CHROMIUM', '']
  let failures = 0
  const fail = (m: string) => { failures++; lines.push('  X  ' + m) }
  const ok = (m: string) => lines.push('  OK ' + m)

  for (const n of assertStructureMatchesComponent()) ok(n)
  lines.push('')

  // The ax page renders inside DashboardShell, whose desktop sidebar is a fixed 220px
  // (DashboardShell.tsx:40, `w-[220px] flex-shrink-0`). Measuring at the full viewport would have
  // given the panel 220px it does not have — so the surface width is the viewport MINUS the rail.
  const SIDEBAR = 220
  const browser = await chromium.launch()
  for (const viewport of [1280, 1440, 1920]) {
    const width = viewport - SIDEBAR
    const p = await browser.newPage({ viewport: { width: viewport, height: 820 } })
    await p.setContent(page(width))
    await p.waitForTimeout(180)
    const r = await p.evaluate(probe) as Record<string, number | boolean>
    lines.push('=== viewport ' + viewport + 'px  ->  surface ' + width + 'px (sidebar ' + SIDEBAR + ') ===')
    lines.push('  ' + JSON.stringify(r))

    if (r.overflows_stage) fail(width + ': panel overflows the viewport')
    else ok(width + ': panel inside the viewport (gap ' + r.gap_to_viewport_right + 'px)')

    if ((r.controls_clipped as number) > 0) fail(width + ': ' + r.controls_clipped + ' control(s) CLIPPED — rename/pin unreachable')
    else ok(width + ': all ' + r.control_count + ' row controls fully inside the panel')

    if ((r.controls_squashed as number) > 0) fail(width + ': ' + r.controls_squashed + ' control(s) squashed below 30px (narrowest ' + r.narrowest_control_w + 'px)')
    else ok(width + ': no control squashed (narrowest ' + r.narrowest_control_w + 'px)')

    lines.push('  -- covers ' + r.covers_conversation_pct + '% of the conversation area')
    lines.push('  -- ' + r.titles_ellipsised + '/' + THREADS.length + ' titles ellipsised (CSS truncation, expected)')

    await p.screenshot({ path: join(OUT, 's3-panel-' + viewport + '.png') })
    await p.close()
  }
  await browser.close()

  lines.push('')
  lines.push(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' FINDING(S) — see above')
  const report = lines.join('\n')
  console.log(report)
  writeFileSync(join(OUT, 's3-panel-report.txt'), report)
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
