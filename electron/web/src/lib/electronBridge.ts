type ElectronBridge = NonNullable<Window['electron']>

export type RuntimeCheck =
  | { ok: true; bridge: ElectronBridge }
  | { ok: false; reason: 'missing_bridge' | 'invalid_bridge'; missingMethods?: string[] }

const REQUIRED_METHODS: Array<keyof ElectronBridge> = [
  'getConfig',
  'windowMinimize',
  'windowMaximize',
  'windowClose',
  'startServiceForApp',
  'restartServiceNeutral',
  'getCurrentAppId',
  'checkForUpdates',
  'downloadUpdate',
  'installUpdate',
  'onUpdateAvailable',
  'onUpdateDownloaded',
  'onDownloadProgress',
  'onUpdateError',
  'onConfigUpdated',
]

/** Validated once at bootstrap in main.tsx, then trusted for the session. */
let cachedResult: RuntimeCheck | null = null

export function validateElectronRuntime(): RuntimeCheck {
  if (cachedResult) return cachedResult

  const bridge = window.electron
  if (!bridge) {
    cachedResult = { ok: false, reason: 'missing_bridge' }
    return cachedResult
  }

  const missingMethods = REQUIRED_METHODS.filter(
    (name) => typeof bridge[name] !== 'function'
  )

  if (missingMethods.length > 0) {
    cachedResult = { ok: false, reason: 'invalid_bridge', missingMethods }
    return cachedResult
  }

  cachedResult = { ok: true, bridge }
  return cachedResult
}

/**
 * Returns the validated bridge. Only call this after the root gate
 * has confirmed the runtime is valid (i.e. App is mounted).
 */
export function getElectronBridge(): ElectronBridge {
  const result = cachedResult ?? validateElectronRuntime()
  if (!result.ok) {
    throw new Error('getElectronBridge() called but runtime validation failed')
  }
  return result.bridge
}

/** Reset module state between tests. */
export function _resetForTesting() {
  cachedResult = null
}
