import { ipcRenderer } from 'electron'

// SHELL-1 — draws the AriaOS/POS windows' custom chrome (sage/neutral flag-tab top-left, single ×
// top-right) entirely at the Electron layer, injected into the DOM after the real page loads. This
// is the mechanism that keeps the main Next.js app at zero product-code changes: nothing here is
// part of that app's source — it's a preload script overlaying a bar on top of whatever page loaded,
// the same technique VS Code/Discord/Slack's desktop shells use for frameless custom title bars.
//
// Known limitation, not fixed in this pass: if the real page's own top navigation uses
// position:fixed, this overlay can sit on top of it rather than push it down (margin-top on
// <html> only moves elements in normal document flow). Verify visually per app; a follow-up pass
// can raise the bar's z-index further or make it fully transparent if real content peeks through.

const KIND = (() => {
  const arg = process.argv.find((a) => a.startsWith('--canopy-app-kind='))
  return (arg ? arg.split('=')[1] : 'ariaos') as 'ariaos' | 'pos'
})()

const FLAG_COLOR = KIND === 'ariaos' ? '#7FB897' : '#2D5240'
const BAR_HEIGHT = 30

function injectChrome(): void {
  if (document.getElementById('__canopy_chrome_bar')) return

  const bar = document.createElement('div')
  bar.id = '__canopy_chrome_bar'
  bar.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; height: ${BAR_HEIGHT}px; z-index: 2147483647;
    display: flex; align-items: stretch; background: rgba(10,10,10,.92);
    font-family: 'Outfit', system-ui, sans-serif;
  `

  const flag = document.createElement('div')
  flag.style.cssText = `
    width: 34px; height: 100%; background: ${FLAG_COLOR};
    clip-path: polygon(0 0, 100% 0, 76% 100%, 0 100%);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  `
  const mark = document.createElement('span')
  mark.textContent = 'A'
  mark.style.cssText = `font-family: Georgia, serif; font-weight: 700; font-size: 13px; color: #0a0a0a;`
  flag.appendChild(mark)

  const drag = document.createElement('div')
  drag.style.cssText = `flex: 1; -webkit-app-region: drag;`

  const close = document.createElement('button')
  close.textContent = '×'
  close.setAttribute('aria-label', 'Close')
  close.style.cssText = `
    width: 34px; height: 100%; border: none; background: transparent; color: rgba(255,255,255,.65);
    font-size: 17px; line-height: 1; cursor: pointer; -webkit-app-region: no-drag; flex-shrink: 0;
  `
  close.addEventListener('mouseenter', () => { close.style.color = '#ff6b5e' })
  close.addEventListener('mouseleave', () => { close.style.color = 'rgba(255,255,255,.65)' })
  close.addEventListener('click', () => ipcRenderer.send('chrome:close'))

  bar.appendChild(flag)
  bar.appendChild(drag)
  bar.appendChild(close)
  document.body.appendChild(bar)

  document.documentElement.style.setProperty('margin-top', `${BAR_HEIGHT}px`)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectChrome)
} else {
  injectChrome()
}
