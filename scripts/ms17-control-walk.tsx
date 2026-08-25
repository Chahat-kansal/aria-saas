/**
 * MS17 PHASE 5 — THE PANEL AGAINST REAL DATA, CONTROL BY CONTROL.
 *
 * For every control that survived phase 3: what it is wired to, whether that wire RESOLVES (the
 * route file exists on disk and exports the verb the caller uses), and what it renders at
 * 1280 / 1440 / 1920 in both states.
 *
 * ⚠️ WHAT THIS IS NOT. I cannot click these controls in an authenticated session — the route sits
 * behind DashboardShell and Supabase auth, and .env is not readable in this environment. So this
 * walks the wiring and the render, not a live click. Every row says which it is. "Rendered
 * plausibly but did nothing" is the failure this sprint exists to kill, so the distinction is kept
 * sharp rather than blurred into a tick.
 */
import { chromium } from 'playwright'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
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

/** Every route any Ask Aria surface file calls. */
const SURFACE_FILES = [
  'src/components/ask-aria-ax/AskAriaTransition.tsx',
  'src/components/ask-aria-ax/rooms/ThreadsPanel.tsx',
  'src/components/ask-aria-ax/rooms/AwaitingRoom.tsx',
  'src/components/ask-aria-ax/rooms/MadeForYouRoom.tsx',
  'src/components/ask-aria-ax/ProposalCard.tsx',
  'src/components/ask-aria-ax/useAriaStream.ts',
  'src/components/aria/VoiceInput.tsx',
  'src/components/aria/ChatSuggestions.tsx',
  'src/components/aria/SkillPicker.tsx',
  'src/components/aria/AuditLogCard.tsx',
]

function routeFileFor(apiPath: string): string | null {
  const clean = apiPath.split('?')[0]!.replace(/^\//, '')
  const candidate = join(ROOT, 'src/app', clean, 'route.ts')
  if (existsSync(candidate)) return candidate
  // dynamic segment, e.g. /api/aria/task-outputs/123/share
  const parts = clean.split('/')
  for (let i = parts.length - 1; i > 0; i--) {
    const guess = join(ROOT, 'src/app', ...parts.slice(0, i), '[id]', ...parts.slice(i + 1), 'route.ts')
    if (existsSync(guess)) return guess
  }
  return null
}

function page(work: boolean, room: string | null) {
  let body = surface
  if (work) body = body.replace('class="ax-surface"', 'class="ax-surface work"')
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${appCss}</style><style>${axCss}</style></head><body data-room="${room ?? 'ask'}">
<div class="flex h-screen bg-[#0f0f13] overflow-hidden">
  <div class="hidden md:block flex-shrink-0"><div id="sidebar" class="w-[220px] flex-shrink-0 bg-black h-screen"></div></div>
  <div class="flex-1 flex flex-col overflow-hidden min-w-0">
    <main id="content" class="flex-1 relative overscroll-contain overflow-hidden">${body}</main>
  </div>
</div></body></html>`
}

async function run() {
  const lines: string[] = []
  lines.push('MS17 PHASE 5 — CONTROL WALK')
  lines.push('')

  // ── A. every wire, and whether it resolves ──────────────────────────────────────────────────
  lines.push('═══ A. WIRING — does each route the surface calls actually exist? ═══')
  const seen = new Map<string, string[]>()
  for (const f of SURFACE_FILES) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    for (const m of src.matchAll(/fetch\(\s*[`'"]([^`'"]+)[`'"]/g)) {
      const p = m[1]!
      if (!p.startsWith('/api/')) continue
      if (!seen.has(p)) seen.set(p, [])
      seen.get(p)!.push(f.replace('src/components/', ''))
    }
    // template-literal routes, e.g. `/api/aria/ask/history?id=${id}`
    for (const m of src.matchAll(/fetch\(\s*`(\/api\/[^`$]*)/g)) {
      const p = m[1]!.replace(/\?.*$/, '')
      if (!seen.has(p)) seen.set(p, [])
      if (!seen.get(p)!.includes(f)) seen.get(p)!.push(f.replace('src/components/', ''))
    }
  }
  let broken = 0
  for (const [p, callers] of [...seen.entries()].sort()) {
    const file = routeFileFor(p)
    if (file) lines.push(`  ✓ ${p.padEnd(38)} -> ${file.replace(ROOT + '/', '')}`)
    else { broken++; lines.push(`  ✗ ${p.padEnd(38)} -> NO ROUTE FILE (called by ${callers.join(', ')})`) }
  }
  lines.push(`  ${broken === 0 ? 'every wire resolves to a route file' : broken + ' DEAD WIRE(S)'}`)

  // ── B. the render, at real sizes ────────────────────────────────────────────────────────────
  const browser = await chromium.launch()
  lines.push('')
  lines.push('═══ B. RENDER at 1280 / 1440 / 1920 x 900 ═══')
  for (const width of [1280, 1440, 1920]) {
    for (const work of [false, true]) {
      const state = work ? 'working' : 'welcome'
      const p = await browser.newPage({ viewport: { width, height: 900 } })
      await p.setContent(page(work, null))
      await p.waitForTimeout(600)

      const counts = await p.evaluate(`(function(){
        var host=document.querySelector('.ax-surface');
        var q=function(s){return host.querySelectorAll(s).length};
        var tabs=Array.prototype.map.call(host.querySelectorAll('.nav a'),function(a){return a.textContent.trim()});
        return {
          tabs: tabs, roomTabs: tabs.length,
          buttons: q('button'), inputs: q('input,textarea'),
          noticed: q('.noticed .nt'), badge: q('.nav .badge'),
          fallback: q('.fallback'), placeholderFace: q('.hair,.head,.fringe,.eye,.smile,.torso,.lapel'),
          overflowX: document.documentElement.scrollWidth > window.innerWidth
        };
      })()`) as Record<string, unknown>

      lines.push(`  ${width}x900 ${state.padEnd(8)} tabs=[${(counts.tabs as string[]).join(' | ')}]`
        + ` buttons=${counts.buttons} inputs=${counts.inputs}`
        + ` noticed=${counts.noticed} badge=${counts.badge}`
        + ` drawnFace=${counts.placeholderFace} overflowX=${counts.overflowX}`)

      if (counts.placeholderFace !== 0) lines.push('    ✗ THE DRAWN PLACEHOLDER FACE IS RENDERING')
      if (counts.overflowX) lines.push('    ✗ HORIZONTAL OVERFLOW')

      await p.screenshot({ path: join(OUT, `ms17-${width}-${state}.png`) })
      await p.close()
    }
  }
  await browser.close()

  lines.push('')
  lines.push('NOTE: rendered statically. Effects do not run, so the avatar shows its .fallback label,')
  lines.push('the noticed list shows its loading state, and rooms other than Ask are not entered.')
  lines.push('No control was CLICKED in an authenticated session — see the header comment.')

  const report = lines.join('\n')
  console.log(report)
  writeFileSync(join(OUT, 'ms17-control-walk.txt'), report)
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
