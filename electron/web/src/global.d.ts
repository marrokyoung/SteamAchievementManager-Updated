// We can add custom APIs to the window.electron object here (renderer gets proper typings from this)
export interface ElectronAPI {
  getConfig: () => Promise<{ baseUrl: string; token: string }>
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
