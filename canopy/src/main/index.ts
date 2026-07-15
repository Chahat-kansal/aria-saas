import { app, ipcMain, BrowserWindow, Menu } from 'electron'
import { autoUpdater } from 'electron-updater'
import {
  createCanopyWindow, getCanopyWindow, openAppWindow, closeAppWindow,
  isAppWindowOpen, registerChromeIpc, signOutOfMachine,
} from './windows'
import {
  fetchCurrentBusiness, fetchRecentActivity, fetchHealthQuick, fetchTodaySales, verifyCanopyPin,
  fetchSavedReports,
} from './api'
import { exportReportToWindows } from './export'

app.whenReady().then(() => {
  // SHELL-1 — kiosk mode holds the window fullscreen with no OS chrome visible underneath;
  // removing the default application menu clears the one sliver of native chrome Electron still
  // adds on top of that by default.
  Menu.setApplicationMenu(null)

  registerChromeIpc()
  registerCanopyIpc()
  createCanopyWindow()

  autoUpdater.checkForUpdatesAndNotify().catch(() => { /* non-fatal — no release published yet */ })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createCanopyWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function registerCanopyIpc(): void {
  ipcMain.handle('canopy:get-business', async () => fetchCurrentBusiness())

  ipcMain.handle('canopy:get-activity', async (_e, businessId: string) => fetchRecentActivity(businessId))

  ipcMain.handle('canopy:get-health', async (_e, businessId: string) => fetchHealthQuick(businessId))

  ipcMain.handle('canopy:get-today-sales', async () => fetchTodaySales())

  ipcMain.handle('canopy:verify-pin', async (_e, businessId: string, pin: string) => verifyCanopyPin(businessId, pin))

  // CANOPY-UNIVERSAL-SEARCH-1 — `kind` widened from the literal 'ariaos'|'pos' union to string, and
  // an optional {route, title} added, both purely additive: the two existing dock callers pass
  // neither and keep resolving through the fixed APP_PATH lookup in windows.ts exactly as before.
  ipcMain.handle('canopy:open-app', (_e, kind: string, opts?: { route?: string; title?: string }) => {
    openAppWindow(kind, opts)
    return true
  })

  ipcMain.handle('canopy:close-app', (_e, kind: string) => {
    closeAppWindow(kind)
    return true
  })

  ipcMain.handle('canopy:is-app-open', (_e, kind: string) => isAppWindowOpen(kind))

  ipcMain.handle('canopy:sign-out', async () => {
    await signOutOfMachine()
    return true
  })

  // CANOPY-POLISH-1 item 4 — the renderer already re-verifies the owner PIN (scope === 'owner')
  // before ever calling this; nothing here re-checks that, matching every other IPC handler in this
  // file, which all trust the renderer's own gating (there is no separate privileged/unprivileged
  // renderer split in this app — same trust boundary as canopy:sign-out above).
  ipcMain.handle('canopy:exit-app', () => {
    app.quit()
    return true
  })

  ipcMain.handle('canopy:lock', () => {
    // The lock screen is drawn entirely by the renderer over the existing Canopy window — nothing
    // for the main process to do beyond confirming the window is still there.
    return !!getCanopyWindow()
  })

  // CANOPY-REPORTS-AS-FILES-1 — Files app's real data (item 2).
  ipcMain.handle('canopy:get-saved-reports', async () => fetchSavedReports())

  // CANOPY-REPORTS-AS-FILES-1 — real Windows-side export via native save dialog (item 4).
  ipcMain.handle('canopy:export-report', async (_e, pdfUrl: string, suggestedName: string) =>
    exportReportToWindows(getCanopyWindow(), pdfUrl, suggestedName))
}
