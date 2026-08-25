/**
 * MS17 FIX CHECK — the "Awaiting you" room renders its items in full.
 *
 * The founder's screenshot showed the room collapsed to a sliver: one card clipped mid-sentence
 * ("53 Aria recommendations pending review") and a dead white gap below. Cause: the caller wrapped
 * AwaitingRoom — which owns a `.ax-room` — in a SECOND `.ax-room`, and that class is
 * `flex:1 + overflow-y:auto + padding`, so two of them nested fought over the same space.
 *
 * This renders the room inside the real `.talk` structure with fixture data shaped like Sip's live
 * rows (6 shown of 55 pending) and asserts every card is fully visible inside the scroll container.
 */
import { chromium } from 'playwright'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import AwaitingRoom from '@/components/ask-aria-ax/rooms/AwaitingRoom'
import type { AxContext } from '@/lib/aria/ax-context-types'

const ROOT = 'C:/Users/kansa/aria-saas-audit'
const OUT = 'C:/Users/kansa/AppData/Local/Temp/claude/c--Users-kansa-aria-saas-audit/b24228f2-7b5b-4175-9f10-5c3c055b9acf/scratchpad'

const axCss = readFileSync(join(ROOT, 'src/styles/ask-aria-transition.css'), 'utf8')
const cssDir = join(ROOT, '.next/static/css')
const appCssFile = readdirSync(cssDir)
  .map(f => ({ f, size: readFileSync(join(cssDir, f)).length }))
  .sort((a, b) => b.size - a.size)[0]!
const appCss = readFileSync(join(cssDir, appCssFile.f), 'utf8')

/** Shaped like Sip's live rows: six carried, fifty-five actually pending. */
const TITLES = [
  '53 Aria recommendations pending review',
  'Oat milk runs out Thursday',
  'Your margins aren’t real yet',
  'Tuesdays are down 18% since July',
  'Two suppliers have not been paid',
  'Roster gap on Saturday night',
]
const ctx = {
  ownerName: 'Chahat', businessName: 'Sip Café', awaitingTotal: 55,
  today: [], didToday: [], tags: [], noticed: [], quiet: false,
  awaiting: TITLES.map((title, i) => ({
    id: 'a' + i, title,
    subtitle: 'Aria drafted this and is waiting on you before anything happens.',
    tone: (i % 2 ? 'blue' : 'amber') as 'blue' | 'amber',
    prompt: 'Tell me about ' + title, rank: 90 - i,
  })),
} as unknown as AxContext

const room = renderToStaticMarkup(
  React.createElement(AwaitingRoom, { ctx, onPrompt: () => {} }),
)

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${appCss}</style><style>${axCss}</style></head><body>
<div class="flex h-screen bg-[#0f0f13] overflow-hidden">
  <div class="hidden md:block flex-shrink-0"><div class="w-[220px] flex-shrink-0 bg-black h-screen"></div></div>
  <div class="flex-1 flex flex-col overflow-hidden min-w-0">
    <main class="flex-1 relative overscroll-contain overflow-hidden">
      <div class="ax-surface work">
        <div class="stage">
          <div class="hero"></div>
          <div class="talk">
            <div class="th"><div class="av">A</div><div><b>Awaiting you</b><span>Always on · connected records only</span></div></div>
            ${room}
            <div class="write"><div class="box"><textarea rows="1" placeholder="Ask Aria anything…"></textarea>
              <div class="brow"><button class="mode">💬 Skills ⌄</button><button class="send2">↑</button></div></div>
              <div class="oath">Connected records only — she won’t invent missing data</div></div>
          </div>
        </div>
      </div>
    </main>
  </div>
</div></body></html>`

async function run() {
  const browser = await chromium.launch()
  const lines: string[] = []
  let failures = 0
  const fail = (m: string) => { failures++; lines.push('  ✗ ' + m) }
  const ok = (m: string) => lines.push('  ✓ ' + m)

  for (const [w, h] of [[1440, 900], [1280, 900], [1920, 1080]] as const) {
    const p = await browser.newPage({ viewport: { width: w, height: h } })
    await p.setContent(html)
    await p.waitForTimeout(500)

    lines.push('')
    lines.push(`═══ ${w}×${h} ═══`)

    const r = await p.evaluate(`(function(){
      var rooms = document.querySelectorAll('.ax-room');
      var room = rooms[0];
      if(!room) return {rooms:0};
      var rb = room.getBoundingClientRect();
      var cards = Array.prototype.slice.call(room.querySelectorAll('.nt'));
      var clipped = 0, zero = 0;
      var boxes = cards.map(function(c){
        var b = c.getBoundingClientRect();
        if (b.height < 40) zero++;
        if (b.bottom > rb.bottom + 1 && room.scrollHeight <= room.clientHeight + 1) clipped++;
        return Math.round(b.height);
      });
      return {
        rooms: rooms.length,
        roomH: Math.round(rb.height), roomTop: Math.round(rb.top),
        scrollH: room.scrollHeight, clientH: room.clientHeight,
        cards: cards.length, heights: boxes, squashed: zero, clipped: clipped,
        firstCardText: cards[0] ? cards[0].textContent.trim().slice(0,46) : null,
        badge: (document.querySelector('.ax-room-h span')||{}).textContent || null
      };
    })()`) as Record<string, unknown>

    lines.push('  ' + JSON.stringify(r))

    if (r.rooms === 1) ok('exactly ONE .ax-room container (was 2 — the bug)')
    else fail(`${r.rooms} .ax-room containers — nesting is back`)

    if ((r.cards as number) === 6) ok('all six cards rendered')
    else fail(`expected 6 cards, got ${r.cards}`)

    if (r.squashed === 0) ok('no card squashed below 40px (the sliver symptom)')
    else fail(`${r.squashed} card(s) squashed — heights ${JSON.stringify(r.heights)}`)

    if ((r.roomH as number) > 300) ok(`room fills its space (${r.roomH}px tall)`)
    else fail(`room is only ${r.roomH}px tall`)

    if (r.badge === '55') ok('header count is the TRUE pending total (55), not the page size (6)')
    else fail(`header count is "${r.badge}" — expected 55`)

    await p.screenshot({ path: join(OUT, `awaiting-${w}x${h}.png`) })
    await p.close()
  }

  await browser.close()
  lines.push('')
  lines.push(failures === 0 ? 'AWAITING ROOM RENDERS CORRECTLY' : `${failures} FAILURE(S)`)
  const report = lines.join('\n')
  console.log(report)
  writeFileSync(join(OUT, 'awaiting-room-check.txt'), report)
  if (failures > 0) process.exit(1)
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
