// Use CommonJS-style require because Electron loads preload via the Node CJS loader.
// TypeScript will keep this as a require, avoiding the "Cannot use import outside a module" error.
const { contextBridge, ipcRenderer } = require('electron')

export interface UpdateInfo {
  version: string
  releaseNotes?: string
}

export interface DownloadProgress {
  percent: number
  transferred: number
  total: number
}

export interface ElectronAPI {
  getConfig: () => Promise<{ baseUrl: string; token: string }>
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
  startServiceForApp: (appId: number) => Promise<{ success: boolean; token: string; baseUrl: string }>
  restartServiceNeutral: () => Promise<{ success: boolean; token: string; baseUrl: string }>
  getCurrentAppId: () => Promise<{ appId: number | null; token: string; baseUrl: string }>
  checkForUpdates: () => Promise<{ available: boolean }>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateDownloaded: (callback: () => void) => () => void
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
  onUpdateError: (callback: (message: string) => void) => () => void
}

contextBridge.exposeInMainWorld('electron', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  startServiceForApp: (appId: number) => ipcRenderer.invoke('start-service-for-app', appId),
  restartServiceNeutral: () => ipcRenderer.invoke('restart-service-neutral'),
  getCurrentAppId: () => ipcRenderer.invoke('get-current-app-id'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
    const listener = (_: unknown, info: UpdateInfo) => callback(info)
    ipcRenderer.on('update-available', listener)
    return () => { ipcRenderer.removeListener('update-available', listener) }
  },
  onUpdateDownloaded: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('update-downloaded', listener)
    return () => { ipcRenderer.removeListener('update-downloaded', listener) }
  },
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
    const listener = (_: unknown, progress: DownloadProgress) => callback(progress)
    ipcRenderer.on('download-progress', listener)
    return () => { ipcRenderer.removeListener('download-progress', listener) }
  },
  onUpdateError: (callback: (message: string) => void) => {
    const listener = (_: unknown, message: string) => callback(message)
    ipcRenderer.on('update-error', listener)
    return () => { ipcRenderer.removeListener('update-error', listener) }
  }
} as ElectronAPI)

// Simple diagnostic to confirm preload ran and bridge is exposed
console.log('[preload] exposed electron bridge')
