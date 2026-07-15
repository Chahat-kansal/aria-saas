import { BrowserWindow, WebContentsView, shell, ipcMain, session } from 'electron'
import type { Rectangle, WebContents } from 'electron'
import { join } from 'path'
import { PRODUCTION_URL } from './config'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

let canopyWindow: BrowserWindow | null = null

function loadCanopyRenderer(win: BrowserWindow): void {
  if (isDev) void win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function denyPopupsOpenExternally(webContents: WebContents): void {
  // SHELL-1 — shortcuts to third-party tools open in the system browser only, never a new
  // in-app window (no webview panes, no arbitrary window.open() surface this sprint).
  webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
}

/**
 * The Canopy main window. SHELL-1's real auth model: the owner signs into the EXISTING web login
 * once per machine (a normal Supabase session); the PIN lock is a second factor scoping what's
 * visible within that session, not a replacement for it. On a brand-new machine there is no session
 * yet, so this window's FIRST load is the real, unmodified /login page — confirmed in the pre-flight
 * report that middleware.ts already redirects an authenticated visit to /login straight to
 * /dashboard, and an unauthenticated visit shows the real form. Either way, once the URL moves off
 * /login the session exists, and only then do we swap this window's content to the local Canopy
 * desktop route. This relies entirely on existing, unmodified product behaviour — zero product code
 * changes needed to make this work.
 */
export function createCanopyWindow(): BrowserWindow {
  const win = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/canopy.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  canopyWindow = win
  denyPopupsOpenExternally(win.webContents)

  // CANOPY-CONTAINMENT-1 — AriaOS/POS are now WebContentsView panes layered on top of this same
  // window's content (see openAppWindow below), not separate BrowserWindows. A View's bounds don't
  // auto-follow its parent window's size the way a window's own web page content does, so any open
  // pane needs its bounds re-applied whenever this window resizes (display/DPI change — kiosk mode
  // otherwise keeps it pinned to the screen size).
  win.on('resize', () => {
    const bounds = paneBounds(win)
    for (const view of Object.values(appPanes)) view?.setBounds(bounds)
  })

  let swapped = false
  const maybeSwap = (): void => {
    if (swapped) return
    const url = win.webContents.getURL()
    if (url && !url.includes('/login')) {
      swapped = true
      loadCanopyRenderer(win)
    }
  }
  // Catch both a server-side redirect away from /login (middleware.ts's existing guard) and a
  // client-side router transition after the login form's own JS handles a successful sign-in —
  // whichever mechanism the real page actually uses, this doesn't assume which.
  win.webContents.on('did-navigate', maybeSwap)
  win.webContents.on('did-navigate-in-page', maybeSwap)
  win.webContents.on('did-redirect-navigation', maybeSwap)

  void win.loadURL(`${PRODUCTION_URL}/login?redirectTo=%2Fdashboard`)

  win.on('closed', () => { canopyWindow = null })
  return win
}

export function getCanopyWindow(): BrowserWindow | null {
  return canopyWindow
}

/** Re-shows the real login page in the Canopy window (used for a full sign-out, not the PIN lock —
 * the PIN lock never touches the underlying web session). */
export function returnToLogin(): void {
  if (!canopyWindow || canopyWindow.isDestroyed()) return
  void canopyWindow.loadURL(`${PRODUCTION_URL}/login?redirectTo=%2Fdashboard`)
}

// CANOPY-UNIVERSAL-SEARCH-1 — loosened from the literal `'ariaos' | 'pos'` union to a plain string.
// AriaOS/POS still use those two exact kinds unchanged; any AriaOS feature route opened via search
// gets its own kind (the feature's own registry id from App.tsx), so each one gets its own reusable
// pane in `appPanes` below without colliding with each other or with ariaos/pos.
type AppWindowKind = string

// CANOPY-CONTAINMENT-1 — AriaOS/POS panes, keyed by kind. Replaces the old ariaosWindow/posWindow
// separate-BrowserWindow variables with the WebContentsView instances layered into
// canopyWindow.contentView (see openAppWindow below).
const appPanes: Partial<Record<AppWindowKind, WebContentsView>> = {}

function paneBounds(win: BrowserWindow): Rectangle {
  const { width, height } = win.getContentBounds()
  return { x: 0, y: 0, width, height }
}

const APP_PATH: Record<string, string> = {
  ariaos: '/dashboard',
  pos: '/pos/terminal',
}

/**
 * CANOPY-CONTAINMENT-1 — AriaOS/POS render as a real WebContentsView pane loading the actual
 * deployed routes UNMODIFIED (same login, same data as the web version), added as a child view of
 * Canopy's own BrowserWindow.contentView and sized to fill it — genuinely embedded inside Canopy's
 * single OS-level window rather than opened as a second, separate one (SHELL-1's original approach,
 * which meant AriaOS/POS showed up as their own Alt-Tab / taskbar entries even with the fullscreen/
 * skipTaskbar fix, since skipTaskbar only hides the taskbar button — the window itself was still a
 * distinct top-level surface). WebContentsView, not <webview> — the SHELL-1 pre-flight confirmed
 * X-Frame-Options: DENY is set globally and blocks <webview>'s iframe-based loading; WebContentsView
 * composites as a native view, not an iframe, so that header doesn't apply to it. Custom chrome
 * (traffic-light dots, centered title) is the same injected chrome preload script as before, now
 * attached to the pane's own webContents instead of a separate window's — its drag-region/DOM-inject
 * mechanism is unchanged by this migration.
 *
 * CANOPY-UNIVERSAL-SEARCH-1 — `opts.route`/`opts.title` are additive: every existing call site
 * (AriaOS/POS, via the dock or the launcher) omits them and keeps resolving the route from the
 * fixed APP_PATH lookup exactly as before. Passing them is what lets the universal-search launcher
 * open an arbitrary real AriaOS feature page (any `src/app/dashboard/**` route) through this exact
 * same reliable-pane mechanism instead of a bespoke one — same real login, same real data, same
 * chrome, same containment.
 */
export function openAppWindow(kind: AppWindowKind, opts?: { route?: string; title?: string }): void {
  const canopy = canopyWindow
  if (!canopy || canopy.isDestroyed()) return

  const existing = appPanes[kind]
  if (existing) {
    existing.setVisible(true)
    canopy.contentView.addChildView(existing) // re-adding reorders it to topmost
    existing.webContents.focus()
    return
  }

  const route = opts?.route ?? APP_PATH[kind]
  if (!route) return // unknown kind with no explicit route — nothing to open

  const preloadArgs = [`--canopy-app-kind=${kind}`]
  if (opts?.title) preloadArgs.push(`--canopy-app-title=${encodeURIComponent(opts.title)}`)

  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, `../preload/chrome.js`),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: preloadArgs,
    },
  })
  view.setBackgroundColor('#0a0a0a')
  view.setBounds(paneBounds(canopy))
  denyPopupsOpenExternally(view.webContents)
  void view.webContents.loadURL(`${PRODUCTION_URL}${route}`)

  canopy.contentView.addChildView(view)
  appPanes[kind] = view

  view.webContents.on('destroyed', () => {
    delete appPanes[kind]
    // Keep the Shelf's running-indicator accurate even when the pane is closed via its own chrome
    // × rather than the Shelf — the renderer never polls for this, it's told.
    if (canopy && !canopy.isDestroyed()) {
      canopy.contentView.removeChildView(view)
      canopy.webContents.send('canopy:app-closed', kind)
    }
  })
}

export function closeAppWindow(kind: AppWindowKind): void {
  const view = appPanes[kind]
  view?.webContents.close()
}

export function isAppWindowOpen(kind: AppWindowKind): boolean {
  return !!appPanes[kind]
}

/** Wires the chrome preload's close-button IPC to whichever real pane sent it. */
export function registerChromeIpc(): void {
  ipcMain.on('chrome:close', (event) => {
    const kind = (Object.keys(appPanes) as AppWindowKind[]).find((k) => appPanes[k]?.webContents === event.sender)
    if (kind) closeAppWindow(kind)
  })
}

/** Full sign-out — clears the shared session (logs the machine out of the web app entirely) and
 * returns the Canopy window to the real login page. Distinct from the PIN lock, which never touches
 * this session. */
export async function signOutOfMachine(): Promise<void> {
  closeAppWindow('ariaos')
  closeAppWindow('pos')
  await session.defaultSession.clearStorageData({ storages: ['cookies'] })
  returnToLogin()
}
