import { BrowserWindow, shell, ipcMain, session } from 'electron'
import { join } from 'path'
import { PRODUCTION_URL } from './config'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

let canopyWindow: BrowserWindow | null = null
let ariaosWindow: BrowserWindow | null = null
let posWindow: BrowserWindow | null = null

function loadCanopyRenderer(win: BrowserWindow): void {
  if (isDev) void win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function denyPopupsOpenExternally(win: BrowserWindow): void {
  // SHELL-1 — shortcuts to third-party tools open in the system browser only, never a new
  // in-app window (no webview panes, no arbitrary window.open() surface this sprint).
  win.webContents.setWindowOpenHandler(({ url }) => {
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
  denyPopupsOpenExternally(win)

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

type AppWindowKind = 'ariaos' | 'pos'

function getExisting(kind: AppWindowKind): BrowserWindow | null {
  return kind === 'ariaos' ? ariaosWindow : posWindow
}

function setExisting(kind: AppWindowKind, win: BrowserWindow | null): void {
  if (kind === 'ariaos') ariaosWindow = win
  else posWindow = win
}

const APP_PATH: Record<AppWindowKind, string> = {
  ariaos: '/dashboard',
  pos: '/pos/terminal',
}

/**
 * A real, separate BrowserWindow loading the actual deployed AriaOS/POS routes UNMODIFIED — same
 * login, same data as the web version. Custom chrome (flag-tab top-left, single x top-right) is
 * drawn by the injected chrome preload script at the Electron layer, not by editing any file in the
 * main Next.js app. BrowserWindow (top-level navigation), not <webview> — confirmed in the pre-flight
 * report that X-Frame-Options: DENY is set globally and would block <webview>'s iframe-based loading;
 * a plain BrowserWindow is unaffected by that header entirely.
 */
export function openAppWindow(kind: AppWindowKind): BrowserWindow {
  const existing = getExisting(kind)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return existing
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, `../preload/chrome.js`),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--canopy-app-kind=${kind}`],
    },
  })
  denyPopupsOpenExternally(win)
  void win.loadURL(`${PRODUCTION_URL}${APP_PATH[kind]}`)

  setExisting(kind, win)
  win.on('closed', () => {
    setExisting(kind, null)
    // Keep the Shelf's running-indicator accurate even when the real window is closed via its own
    // chrome × rather than the Shelf — the renderer never polls for this, it's told.
    const canopy = getCanopyWindow()
    if (canopy && !canopy.isDestroyed()) canopy.webContents.send('canopy:app-closed', kind)
  })
  return win
}

export function closeAppWindow(kind: AppWindowKind): void {
  const win = getExisting(kind)
  if (win && !win.isDestroyed()) win.close()
}

export function isAppWindowOpen(kind: AppWindowKind): boolean {
  const win = getExisting(kind)
  return !!win && !win.isDestroyed()
}

/** Wires the chrome preload's close-button IPC to whichever real BrowserWindow sent it. */
export function registerChromeIpc(): void {
  ipcMain.on('chrome:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })
}

/** Full sign-out — clears the shared session (logs the machine out of the web app entirely) and
 * returns the Canopy window to the real login page. Distinct from the PIN lock, which never touches
 * this session. */
export async function signOutOfMachine(): Promise<void> {
  if (ariaosWindow && !ariaosWindow.isDestroyed()) ariaosWindow.close()
  if (posWindow && !posWindow.isDestroyed()) posWindow.close()
  await session.defaultSession.clearStorageData({ storages: ['cookies'] })
  returnToLogin()
}
