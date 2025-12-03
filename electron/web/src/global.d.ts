// We can add custom APIs to the window.electron object here (renderer gets proper typings from this)
export interface ElectronAPI {
  getConfig: () => Promise<{ baseUrl: string; token: string }>
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
  startServiceForApp: (appId: number) => Promise<{ success: boolean; token: string; baseUrl: string }>
  restartServiceNeutral: () => Promise<{ success: boolean; token: string; baseUrl: string }>
  getCurrentAppId: () => Promise<{ appId: number | null; token: string; baseUrl: string }>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
