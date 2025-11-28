let apiConfig: { baseUrl: string; token: string } | null = null

export async function initializeAPI() {
  if (!apiConfig) {
    const bridge = window.electron

    if (!bridge?.getConfig) {
      throw new Error(
        'Electron bridge is unavailable. Make sure you are running inside the Electron app, not a plain browser.'
      )
    }

    apiConfig = await bridge.getConfig()
  }
  return apiConfig
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
      case 428:
        throw new Error('Game not initialized. Please select a game from the Picker first.')
      case 503:
        throw new Error('Steam client is not running. Please start Steam and try again.')
      default:
        throw new Error(message || `Request failed: ${response.status}`)
    }
  }

  return response.json()
}
