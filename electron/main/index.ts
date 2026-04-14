import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { createHash, randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'

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

const startupLogPath = path.join(app.getPath('userData'), 'sam-startup.log')

function logStartup(message: string, error?: unknown) {
  const details = error instanceof Error
    ? `${error.message}\n${error.stack ?? ''}`
    : error !== undefined
      ? String(error)
      : ''
  const line = `[${new Date().toISOString()}] ${message}${details ? `\n${details}` : ''}\n`
  try {
    fs.appendFileSync(startupLogPath, line, 'utf8')
  } catch {
    // Best-effort logging only.
  }
}

logStartup('main module loaded')

let mainWindow: BrowserWindow | null = null
let serviceProcess: ChildProcess | null = null
let apiToken: string = ''
let isRestartingService = false
let currentForcedAppId: number | null = null
let serviceInstanceCounter = 0

// Allow overriding service URL/port via SAM_BASE_URL env (useful if 8787 is taken)
const DEFAULT_SERVICE_PORT = 8787
const envBaseUrl = process.env.SAM_BASE_URL
const SERVICE_BASE_URL = envBaseUrl && envBaseUrl.trim().length > 0
  ? envBaseUrl
  : `http://127.0.0.1:${DEFAULT_SERVICE_PORT}`
const MAX_HEALTH_ATTEMPTS = 30
const HEALTH_CHECK_INTERVAL = 1000

function getDevServicePath() {
  return path.resolve(process.cwd(), '..', 'bin', 'net48', 'SAM.Service.exe')
}

function getRendererIndexPath() {
  return app.isPackaged
    ? path.join(app.getAppPath(), 'dist', 'index.html')
    : path.resolve(process.cwd(), 'dist', 'index.html')
}

function getPreloadPath() {
  return app.isPackaged
    ? path.join(app.getAppPath(), 'dist-electron', 'preload.cjs')
    : path.resolve(process.cwd(), 'dist-electron', 'preload.cjs')
}

function getServicePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'sam-service', 'SAM.Service.exe')
    : getDevServicePath()
}

function tokenFingerprint(token = apiToken) {
  return createHash('sha256').update(token).digest('hex').slice(0, 8)
}

function pipeServiceOutput(stream: NodeJS.ReadableStream | null, label: 'stdout' | 'stderr') {
  if (!stream) {
    return
  }

  const readable = stream as NodeJS.ReadableStream & {
    setEncoding: (encoding: BufferEncoding) => void
  }

  readable.setEncoding('utf8')
  readable.on('data', (chunk: string | Buffer) => {
    const text = String(chunk).trim()
    if (!text) {
      return
    }

    for (const line of text.split(/\r?\n/)) {
      if (!line) {
        continue
      }

      if (label === 'stderr') {
        console.error(`[SAM.Service] ${line}`)
      } else {
        console.log(`[SAM.Service] ${line}`)
      }
      logStartup(`[service:${label}] ${line}`)
    }
  })
}

function spawnService(extraEnv: Record<string, string> = {}) {
  const servicePath = getServicePath()
  const serviceInstanceId = String(++serviceInstanceCounter)
  const mode = extraEnv.SAM_FORCE_APP_ID ? `app:${extraEnv.SAM_FORCE_APP_ID}` : 'neutral'

  console.log(`Service path: ${servicePath}`)
  logStartup(`resolved service path: ${servicePath}`)
  logStartup(`spawning service instance=${serviceInstanceId} mode=${mode} token=${tokenFingerprint()}`)

  const child = spawn(servicePath, [], {
    env: {
      ...process.env,
      SAM_API_TOKEN: apiToken,
      SAM_BASE_URL: SERVICE_BASE_URL,
      SAM_SERVICE_INSTANCE_ID: serviceInstanceId,
      ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  pipeServiceOutput(child.stdout, 'stdout')
  pipeServiceOutput(child.stderr, 'stderr')
  logStartup(`spawned service instance=${serviceInstanceId} pid=${child.pid ?? 'unknown'} mode=${mode}`)

  return child
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error ?? 'Unknown error')
}

function formatUpdaterError(error: unknown): string {
  const message = getErrorMessage(error)

  if (/Cannot parse releases feed/i.test(message) || /unable to find latest version/i.test(message)) {
    return 'Update metadata is invalid or missing for the latest published release.'
  }

  if (/latest\.yml/i.test(message) && /(not found|cannot find|404)/i.test(message)) {
    return 'Update metadata file latest.yml was not found in the published release.'
  }

  if (message.includes('data:image/') || message.length > 300) {
    return 'The update server returned invalid release metadata.'
  }

  return message
}

async function startService(): Promise<void> {
  logStartup('startService called')
  console.log('Starting SAM.Service...')

  // Generate cryptographically random token
  apiToken = randomBytes(32).toString('hex')
  console.log('Generated API token')
  logStartup(`generated API token ${tokenFingerprint()} for neutral service`)

  serviceProcess = spawnService()

  serviceProcess.on('error', (err) => {
    console.error('Failed to start SAM.Service:', err)
    logStartup('service process error', err)
  })

  serviceProcess.on('exit', (code) => {
    console.log(`SAM.Service exited with code ${code}`)
    logStartup(`service process exited with code ${code}`)
    serviceProcess = null
  })

  // Poll authenticated readiness endpoint until the new service instance is ready.
  await pollHealthEndpoint()
  console.log('SAM.Service is ready')

  // Neutral mode
  currentForcedAppId = null
}

async function pollHealthEndpoint(): Promise<void> {
  for (let i = 0; i < MAX_HEALTH_ATTEMPTS; i++) {
    try {
      const response = await fetch(`${SERVICE_BASE_URL}/api/status`, {
        headers: {
          'X-SAM-Auth': apiToken
        }
      })
      const body = await response.text().catch(() => '')
      if (response.ok) {
        logStartup(`service status ready attempt=${i + 1} token=${tokenFingerprint()} body=${body}`)
        return // Service is ready
      }
      logStartup(`service status not ready attempt=${i + 1} status=${response.status} token=${tokenFingerprint()} body=${body}`)
    } catch (err) {
      logStartup(`service status failed attempt=${i + 1}`, err)
      // Service not ready yet, continue polling
    }

    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL))
  }

  throw new Error('SAM.Service failed to start within timeout period')
}

async function stopService(): Promise<void> {
  const processToStop = serviceProcess
  if (processToStop) {
    console.log('Stopping SAM.Service...')
    logStartup(`stopping service pid=${processToStop.pid ?? 'unknown'}`)
    serviceProcess = null

    if (processToStop.exitCode !== null) {
      logStartup(`service pid=${processToStop.pid ?? 'unknown'} already exited code=${processToStop.exitCode}`)
      return
    }

    const exited = new Promise<void>((resolve) => {
      processToStop.once('exit', (code) => {
        logStartup(`service pid=${processToStop.pid ?? 'unknown'} exit observed code=${code}`)
        resolve()
      })
      processToStop.once('error', (error) => {
        logStartup(`service pid=${processToStop.pid ?? 'unknown'} error during stop`, error)
        resolve()
      })
    })

    const killSent = processToStop.kill()
    logStartup(`service kill signal sent pid=${processToStop.pid ?? 'unknown'} result=${killSent}`)

    // Avoid racing the replacement service against the old process still
    // owning the port, but don't hang forever on shutdown.
    const stopped = await Promise.race([
      exited.then(() => true),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 3000))
    ])
    logStartup(`service stop wait complete pid=${processToStop.pid ?? 'unknown'} exited=${stopped}`)
  }
}

async function restartServiceWithAppId(appId: number): Promise<void> {
  console.log(`Restarting service for AppId ${appId}...`)

  await stopService()

  // Generate new token for security
  apiToken = randomBytes(32).toString('hex')
  console.log('Generated new API token')
  logStartup(`generated API token ${tokenFingerprint()} for AppId ${appId}`)

  serviceProcess = spawnService({
    SAM_FORCE_APP_ID: appId.toString()
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
  logStartup('createWindow called')
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    logStartup('loading Vite dev server URL')
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    const rendererIndexPath = getRendererIndexPath()
    logStartup(`loading packaged index: ${rendererIndexPath}`)
    await mainWindow.loadFile(rendererIndexPath)
  }

  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedUrl) => {
    logStartup(`webContents did-fail-load code=${code} url=${validatedUrl} description=${description}`)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logStartup(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`)
  })

  mainWindow.on('closed', () => {
    logStartup('main window closed')
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
    logStartup('updater error', err)
    mainWindow?.webContents.send('update-error', formatUpdaterError(err))
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
  } catch (error) {
    logStartup('check-for-updates failed', error)
    return { available: false }
  }
})

ipcMain.handle('download-update', async () => {
  try {
    const updater = await getAutoUpdater()
    await updater.downloadUpdate()
  } catch (error) {
    throw new Error(formatUpdaterError(error))
  }
})

ipcMain.handle('install-update', async () => {
  let serviceStopped = false
  try {
    // Resolve the updater before stopping the service so a failure here
    // doesn't leave the app running without its backend.
    const updater = await getAutoUpdater()
    await stopService()
    serviceStopped = true
    updater.quitAndInstall(false, true)
  } catch (error) {
    if (serviceStopped) {
      // Service is down but install failed — restart the backend.
      // startService() generates a new apiToken, so push it to the renderer
      // to avoid 401s from the stale cached token.
      try {
        await startService()
        mainWindow?.webContents.send('config-updated', {
          baseUrl: SERVICE_BASE_URL,
          token: apiToken
        })
      } catch { /* best-effort */ }
    }
    throw new Error(formatUpdaterError(error))
  }
})

// App lifecycle
app.whenReady().then(async () => {
  try {
    logStartup('app.whenReady entered')
    await startService()
    logStartup('startService completed')
    await setupAutoUpdater()
    logStartup('setupAutoUpdater completed')
    await createWindow()
    logStartup('createWindow completed')
  } catch (err) {
    console.error('Failed to start application:', err)
    logStartup('application startup failed', err)
    app.quit()
  }
})

app.on('window-all-closed', async () => {
  logStartup('window-all-closed received')
  await stopService()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

process.on('exit', () => {
  logStartup('process exit received')
  // Note: Can't use async here, but stopService will still run synchronously
  if (serviceProcess) {
    serviceProcess.kill()
  }
})

process.on('uncaughtException', (error) => {
  logStartup('uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  logStartup('unhandledRejection', reason)
})
