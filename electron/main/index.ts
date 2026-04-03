import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

// electron-updater is CJS — use a lazy dynamic import so the ESM main
// process doesn't blow up at module-evaluation time.
type AutoUpdater = import('electron-updater').AppUpdater
let _autoUpdater: AutoUpdater | null = null
async function getAutoUpdater(): Promise<AutoUpdater> {
  if (!_autoUpdater) {
    const mod = await import('electron-updater')
    _autoUpdater = mod.autoUpdater ?? (mod as unknown as { default: { autoUpdater: AutoUpdater } }).default.autoUpdater
  }
  return _autoUpdater
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let serviceProcess: ChildProcess | null = null
let apiToken: string = ''
let isRestartingService = false
let currentForcedAppId: number | null = null

// Allow overriding service URL/port via SAM_BASE_URL env (useful if 8787 is taken)
const DEFAULT_SERVICE_PORT = 8787
const envBaseUrl = process.env.SAM_BASE_URL
const SERVICE_BASE_URL = envBaseUrl && envBaseUrl.trim().length > 0
  ? envBaseUrl
  : `http://127.0.0.1:${DEFAULT_SERVICE_PORT}`
const MAX_HEALTH_ATTEMPTS = 30
const HEALTH_CHECK_INTERVAL = 1000

async function startService(): Promise<void> {
  console.log('Starting SAM.Service...')

  // Generate cryptographically random token
  apiToken = randomBytes(32).toString('hex')
  console.log('Generated API token')

  // Locate SAM.Service.exe
  // In development, the compiled file is at: electron/dist-electron/index.js
  // We need to go up 2 levels to electron/, then up 1 more to repo root
  const servicePath = app.isPackaged
    ? path.join(process.resourcesPath, 'sam-service', 'SAM.Service.exe')
    : path.resolve(__dirname, '..', '..', 'bin', 'net48', 'SAM.Service.exe')

  console.log(`Service path: ${servicePath}`)

  // Spawn service with token
  serviceProcess = spawn(servicePath, [], {
    env: {
      ...process.env,
      SAM_API_TOKEN: apiToken,
      SAM_BASE_URL: SERVICE_BASE_URL
    },
    stdio: 'inherit'
  })

  serviceProcess.on('error', (err) => {
    console.error('Failed to start SAM.Service:', err)
  })

  serviceProcess.on('exit', (code) => {
    console.log(`SAM.Service exited with code ${code}`)
    serviceProcess = null
  })

  // Poll /health endpoint until ready
  await pollHealthEndpoint()
  console.log('SAM.Service is ready')

  // Neutral mode
  currentForcedAppId = null
}

async function pollHealthEndpoint(): Promise<void> {
  for (let i = 0; i < MAX_HEALTH_ATTEMPTS; i++) {
    try {
      const response = await fetch(`${SERVICE_BASE_URL}/health`)
      if (response.ok) {
        return // Service is ready
      }
    } catch (err) {
      // Service not ready yet, continue polling
    }

    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL))
  }

  throw new Error('SAM.Service failed to start within timeout period')
}

async function stopService(): Promise<void> {
  if (serviceProcess) {
    console.log('Stopping SAM.Service...')
    serviceProcess.kill()
    serviceProcess = null

    // Wait briefly for process to exit
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

async function restartServiceWithAppId(appId: number): Promise<void> {
  console.log(`Restarting service for AppId ${appId}...`)

  await stopService()

  // Generate new token for security
  apiToken = randomBytes(32).toString('hex')
  console.log('Generated new API token')

  const servicePath = app.isPackaged
    ? path.join(process.resourcesPath, 'sam-service', 'SAM.Service.exe')
    : path.resolve(__dirname, '..', '..', 'bin', 'net48', 'SAM.Service.exe')

  console.log(`Service path: ${servicePath}`)

  // Spawn with SAM_FORCE_APP_ID environment variable
  serviceProcess = spawn(servicePath, [], {
    env: {
      ...process.env,
      SAM_API_TOKEN: apiToken,
      SAM_BASE_URL: SERVICE_BASE_URL,
      SAM_FORCE_APP_ID: appId.toString()
    },
    stdio: 'inherit'
  })

  let startupError: Error | null = null

  serviceProcess.on('error', (err) => {
    console.error('Failed to start SAM.Service:', err)
    startupError = err
  })

  serviceProcess.on('exit', (code) => {
    console.log(`SAM.Service exited with code ${code}`)
    if (code !== null && code !== 0 && !startupError) {
      startupError = new Error(`Service exited with code ${code}`)
    }
    serviceProcess = null
  })

  // Poll health endpoint
  await pollHealthEndpoint()

  // Check if process exited during health check
  if (startupError) {
    throw startupError
  }

  console.log(`SAM.Service ready for AppId ${appId}`)
  currentForcedAppId = appId
}

async function restartServiceNeutral(): Promise<void> {
  console.log('Restarting service in neutral mode...')

  await stopService()
  await startService() // Uses original startService (no forced AppId)
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC handlers
ipcMain.handle('get-config', () => {
  return {
    baseUrl: SERVICE_BASE_URL,
    token: apiToken
  }
})

ipcMain.on('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on('window-close', () => {
  mainWindow?.close()
})

ipcMain.handle('start-service-for-app', async (_, appId: number) => {
  if (isRestartingService) {
    throw new Error('Service restart already in progress')
  }

  isRestartingService = true
  try {
    await restartServiceWithAppId(appId)
    return { success: true, token: apiToken, baseUrl: SERVICE_BASE_URL }
  } catch (error) {
    console.error('Failed to restart service for app:', error)
    throw error
  } finally {
    isRestartingService = false
  }
})

ipcMain.handle('restart-service-neutral', async () => {
  if (isRestartingService) {
    throw new Error('Service restart already in progress')
  }

  isRestartingService = true
  try {
    await restartServiceNeutral()
    return { success: true, token: apiToken, baseUrl: SERVICE_BASE_URL }
  } catch (error) {
    console.error('Failed to restart service to neutral mode:', error)
    throw error
  } finally {
    isRestartingService = false
  }
})

ipcMain.handle('get-current-app-id', () => {
  return {
    appId: currentForcedAppId,
    token: apiToken,
    baseUrl: SERVICE_BASE_URL
  }
})

// Auto-update (packaged builds only)
async function setupAutoUpdater() {
  if (!app.isPackaged) {
    console.log('[updater] Skipping auto-update in development')
    return
  }

  const updater = await getAutoUpdater()

  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false

  updater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version)
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes
    })
  })

  updater.on('update-not-available', () => {
    console.log('[updater] No update available')
  })

  updater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  updater.on('update-downloaded', () => {
    console.log('[updater] Update downloaded')
    mainWindow?.webContents.send('update-downloaded')
  })

  updater.on('error', (err) => {
    console.error('[updater] Error:', err.message)
    mainWindow?.webContents.send('update-error', err.message)
  })

  // Don't check eagerly here — the renderer triggers the first check
  // after its event subscriptions are in place (avoids lost notifications).
}

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { available: false }
  try {
    const updater = await getAutoUpdater()
    const result = await updater.checkForUpdates()
    return { available: !!result?.updateInfo }
  } catch {
    return { available: false }
  }
})

ipcMain.handle('download-update', async () => {
  const updater = await getAutoUpdater()
  await updater.downloadUpdate()
})

ipcMain.handle('install-update', async () => {
  // Stop the .NET service before quitting for install
  await stopService()
  const updater = await getAutoUpdater()
  updater.quitAndInstall(false, true)
})

// App lifecycle
app.whenReady().then(async () => {
  try {
    await startService()
    await setupAutoUpdater()
    await createWindow()
  } catch (err) {
    console.error('Failed to start application:', err)
    app.quit()
  }
})

app.on('window-all-closed', async () => {
  await stopService()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

process.on('exit', () => {
  // Note: Can't use async here, but stopService will still run synchronously
  if (serviceProcess) {
    serviceProcess.kill()
  }
})
