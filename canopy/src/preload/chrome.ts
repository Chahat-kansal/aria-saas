import { ipcRenderer } from 'electron'

// CANOPY-REDESIGN-1 — draws the AriaOS/POS windows' custom chrome (macOS-style traffic-light
// controls, light gray bar, centered title) entirely at the Electron layer, injected into the DOM
// after the real page loads. This is the mechanism that keeps the main Next.js app at zero
// product-code changes: nothing here is part of that app's source — it's a preload script
// overlaying a bar on top of whatever page loaded, the same technique VS Code/Discord/Slack's
// desktop shells use for frameless custom title bars. Matches the in-Canopy Win header exactly
// (same #e7e5df bar, same 12px dot size/spacing/colors) so real app windows and in-Canopy panel
// windows read as the same chrome language.
//
// Only the red dot is functional (closes via the existing chrome:close IPC handler); amber/green
// are decorative, no minimize/maximize yet — matches the sprint spec.
//
// Known limitation, not fixed in this pass: if the real page's own top navigation uses
// position:fixed, this overlay can sit on top of it rather than push it down (margin-top on
// <html> only moves elements in normal document flow). Verify visually per app; a follow-up pass
// can raise the bar's z-index further or make it fully transparent if real content peeks through.

const KIND = (() => {
  const arg = process.argv.find((a) => a.startsWith('--canopy-app-kind='))
  return (arg ? arg.split('=')[1] : 'ariaos') as 'ariaos' | 'pos'
})()

const TITLE = KIND === 'pos' ? 'POS' : 'AriaOS'
const BAR_HEIGHT = 34

function injectChrome(): void {
  if (document.getElementById('__canopy_chrome_bar')) return

  const bar = document.createElement('div')
  bar.id = '__canopy_chrome_bar'
  bar.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; height: ${BAR_HEIGHT}px; z-index: 2147483647;
    display: flex; align-items: center; background: #e7e5df; border-bottom: 1px solid rgba(0,0,0,.08);
    -webkit-app-region: drag; font-family: 'Outfit', system-ui, sans-serif;
  `

  const dots = document.createElement('div')
  dots.style.cssText = `display: flex; align-items: center; gap: 8px; padding-left: 14px; -webkit-app-region: no-drag;`

  const DOTS: Array<[string, boolean]> = [
    ['#ff5f57', true],
    ['#ffbd2e', false],
    ['#28c840', false],
  ]
  for (const [color, functional] of DOTS) {
    const dot = document.createElement('div')
    dot.style.cssText = `width: 12px; height: 12px; border-radius: 99px; background: ${color}; ${functional ? 'cursor: pointer;' : ''}`
    if (functional) dot.addEventListener('click', () => ipcRenderer.send('chrome:close'))
    dots.appendChild(dot)
  }
  bar.appendChild(dots)

  const title = document.createElement('span')
  title.textContent = TITLE
  title.style.cssText = `
    position: absolute; left: 50%; transform: translateX(-50%);
    font-size: 12.5px; font-weight: 500; color: rgba(20,20,20,.62);
  `
  bar.appendChild(title)

  document.body.appendChild(bar)
  document.documentElement.style.setProperty('margin-top', `${BAR_HEIGHT}px`)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectChrome)
} else {
  injectChrome()
}
