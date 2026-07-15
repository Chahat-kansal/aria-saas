import { contextBridge, ipcRenderer } from 'electron'

// SHELL-1 — the only bridge between the Canopy renderer and the main process. Every "real data" call
// goes through here to an IPC handler in src/main/index.ts, which in turn calls the real, unmodified
// AriaOS API over HTTPS from the main process (see src/main/api.ts for why it has to be the main
// process, not the renderer, making that call).
const api = {
  getBusiness: () => ipcRenderer.invoke('canopy:get-business'),
  getActivity: (businessId: string) => ipcRenderer.invoke('canopy:get-activity', businessId),
  getHealth: (businessId: string) => ipcRenderer.invoke('canopy:get-health', businessId),
  getTodaySales: () => ipcRenderer.invoke('canopy:get-today-sales'),
  verifyPin: (businessId: string, pin: string) => ipcRenderer.invoke('canopy:verify-pin', businessId, pin),
  openApp: (kind: 'ariaos' | 'pos') => ipcRenderer.invoke('canopy:open-app', kind),
  closeApp: (kind: 'ariaos' | 'pos') => ipcRenderer.invoke('canopy:close-app', kind),
  isAppOpen: (kind: 'ariaos' | 'pos') => ipcRenderer.invoke('canopy:is-app-open', kind),
  signOut: () => ipcRenderer.invoke('canopy:sign-out'),
  exitApp: () => ipcRenderer.invoke('canopy:exit-app'),
  onAppClosed: (cb: (kind: 'ariaos' | 'pos') => void) => {
    const listener = (_e: unknown, kind: 'ariaos' | 'pos') => cb(kind)
    ipcRenderer.on('canopy:app-closed', listener)
    return () => ipcRenderer.removeListener('canopy:app-closed', listener)
  },
}

contextBridge.exposeInMainWorld('canopyAPI', api)

export type CanopyAPI = typeof api
