let apiConfig: { baseUrl: string; token: string } | null = null

export async function initializeAPI() {
  if (!apiConfig) {
    apiConfig = await window.electron.getConfig()
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
    const error = await response.json().catch(() => ({
      message: response.statusText
    }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }

  return response.json()
}
