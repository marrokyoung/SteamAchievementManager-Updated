// Use CommonJS-style require because Electron loads preload via the Node CJS loader.
// TypeScript will keep this as a require, avoiding the "Cannot use import outside a module" error.
const { contextBridge, ipcRenderer } = require('electron')

export interface ElectronAPI {
  getConfig: () => Promise<{ baseUrl: string; token: string }>
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
}

contextBridge.exposeInMainWorld('electron', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close')
} as ElectronAPI)

// Simple diagnostic to confirm preload ran and bridge is exposed
console.log('[preload] exposed electron bridge')
