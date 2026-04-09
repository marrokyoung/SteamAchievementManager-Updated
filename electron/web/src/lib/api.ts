import { getElectronBridge } from '@/lib/electronBridge'

let apiConfig: { baseUrl: string; token: string } | null = null

export class SteamUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SteamUnavailableError'
  }
}

export function isSteamUnavailableError(error: unknown): boolean {
  return error instanceof SteamUnavailableError
}

export async function initializeAPI() {
  if (!apiConfig) {
    apiConfig = await getElectronBridge().getConfig()
  }
  return apiConfig
}

export function updateAPIConfig(config: { baseUrl: string; token: string }) {
  apiConfig = config
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const config = await initializeAPI()

  const response = await fetch(`${config.baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-SAM-Auth': config.token,
      ...options.headers
    }
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const message = errorData.message || response.statusText
    const errorCode = errorData.errorCode || errorData.error || 'unknown_error'

    // User-friendly error messages for common HTTP status codes
    switch (response.status) {
      case 401:
        throw new Error('Authentication failed. Please restart the application.')
      case 403:
        throw new Error(message || 'Access denied. You may not own this game.')
      case 404:
        throw new Error('Schema file not found. Launch the game once in Steam to download it.')
      case 408:
        throw new Error('Request timed out. Steam may be slow to respond.')
      case 409:
        // AppID mismatch - recoverable error
        if (errorCode === 'app_id_mismatch') {
          throw new Error(
            'Steam context changed. This can happen when Steam updates or the app was recently launched. Try initializing the game again.'
          )
        }
        throw new Error(message || 'Conflict with current state. Try again.')
      case 428:
        throw new Error('Game not initialized. Please select a game from the Picker first.')
      case 503:
        // Service unavailable - Steam issues
        if (errorCode === 'steam_install_path_failed' ||
            errorCode === 'steam_load_failed') {
          throw new Error('Steam is not properly installed. Please reinstall Steam.')
        }
        if (errorCode === 'steam_client_creation_failed' ||
            errorCode === 'steam_pipe_creation_failed' ||
            errorCode === 'steam_connect_failed') {
          throw new SteamUnavailableError('Cannot connect to Steam. Please start Steam and try again.')
        }
        throw new SteamUnavailableError('Steam client is not running. Please start Steam and try again.')
      default:
        throw new Error(message || `Request failed: ${response.status}`)
    }
  }

  return response.json()
}
