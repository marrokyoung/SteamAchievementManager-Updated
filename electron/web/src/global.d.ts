export interface UpdateInfo {
  version: string
  releaseNotes?: string
}

export interface DownloadProgress {
  percent: number
  transferred: number
  total: number
}

export interface ServiceConfig {
  baseUrl: string
  token: string
  appId?: number | null
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
  onConfigUpdated: (callback: (config: ServiceConfig) => void) => () => void
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}
