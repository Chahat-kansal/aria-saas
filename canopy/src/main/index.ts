import { app, ipcMain, BrowserWindow, Menu } from 'electron'
import { autoUpdater } from 'electron-updater'
import {
  createCanopyWindow, getCanopyWindow, openAppWindow, closeAppWindow,
  isAppWindowOpen, registerChromeIpc, signOutOfMachine,
} from './windows'
import {
  fetchCurrentBusiness, fetchRecentActivity, fetchHealthQuick, fetchTodaySales, verifyCanopyPin,
} from './api'

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

  ipcMain.handle('canopy:open-app', (_e, kind: 'ariaos' | 'pos') => {
    openAppWindow(kind)
    return true
  })

  ipcMain.handle('canopy:close-app', (_e, kind: 'ariaos' | 'pos') => {
    closeAppWindow(kind)
    return true
  })

  ipcMain.handle('canopy:is-app-open', (_e, kind: 'ariaos' | 'pos') => isAppWindowOpen(kind))

  ipcMain.handle('canopy:sign-out', async () => {
    await signOutOfMachine()
    return true
  })

  ipcMain.handle('canopy:lock', () => {
    // The lock screen is drawn entirely by the renderer over the existing Canopy window — nothing
    // for the main process to do beyond confirming the window is still there.
    return !!getCanopyWindow()
  })
}
