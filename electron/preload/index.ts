import { contextBridge, ipcRenderer } from 'electron'

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
