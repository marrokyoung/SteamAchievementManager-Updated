// Use CommonJS-style require because Electron loads preload via the Node CJS loader.
// TypeScript will keep this as a require, avoiding the "Cannot use import outside a module" error.
const { contextBridge, ipcRenderer } = require('electron')

export interface ElectronAPI {
  getConfig: () => Promise<{ baseUrl: string; token: string }>
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
  startServiceForApp: (appId: number) => Promise<{ success: boolean; token: string; baseUrl: string }>
  restartServiceNeutral: () => Promise<{ success: boolean; token: string; baseUrl: string }>
  getCurrentAppId: () => Promise<{ appId: number | null; token: string; baseUrl: string }>
}

contextBridge.exposeInMainWorld('electron', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  startServiceForApp: (appId: number) => ipcRenderer.invoke('start-service-for-app', appId),
  restartServiceNeutral: () => ipcRenderer.invoke('restart-service-neutral'),
  getCurrentAppId: () => ipcRenderer.invoke('get-current-app-id')
} as ElectronAPI)

// Simple diagnostic to confirm preload ran and bridge is exposed
console.log('[preload] exposed electron bridge')
