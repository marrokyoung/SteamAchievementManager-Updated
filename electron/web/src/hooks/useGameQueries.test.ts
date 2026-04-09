import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useGames } from './useGameQueries'
import { SteamUnavailableError } from '@/lib/api'
import * as api from '@/lib/api'

// Mock the API client — we control every response
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    apiClient: vi.fn(),
    initializeAPI: vi.fn().mockResolvedValue({
      baseUrl: 'http://localhost:3000',
      token: 'test-token',
    }),
  }
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

/** Helper: count apiClient calls whose first arg contains a substring. */
function callsMatching(substring: string) {
  return vi.mocked(api.apiClient).mock.calls.filter(
    ([url]) => typeof url === 'string' && url.includes(substring)
  )
}

/** Helper: wrap a game list in the backend response envelope. */
function ready(games: unknown[]) {
  return { games, libraryReady: true }
}
function notReady(games: unknown[]) {
  return { games, libraryReady: false }
}

describe('useGames', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Basic behaviour ──────────────────────────────────────────────

  it('returns games on success', async () => {
    const games = [{ id: 1, name: 'Game 1', type: 'normal', owned: true }]
    vi.mocked(api.apiClient).mockResolvedValue(ready(games))

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data).toEqual(games))
    expect(result.current.isRecovering).toBe(false)
    expect(result.current.libraryReady).toBe(true)
  })

  it('does not include refresh in query key', async () => {
    vi.mocked(api.apiClient).mockResolvedValue(ready([
      { id: 1, name: 'Game 1', type: 'normal', owned: true },
    ]))

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())

    const normalCall = callsMatching('/api/games').find(
      ([url]) => !(url as string).includes('refresh=true')
    )
    expect(normalCall).toBeTruthy()
  })

  it('forceRefresh bypasses server cache and updates query data', async () => {
    const staleGames = [{ id: 1, name: 'Stale', type: 'normal', owned: true }]
    const freshGames = [
      { id: 1, name: 'Stale', type: 'normal', owned: true },
      { id: 2, name: 'Fresh', type: 'normal', owned: true },
    ]

    vi.mocked(api.apiClient).mockResolvedValue(ready(staleGames))

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.data).toEqual(staleGames))

    vi.mocked(api.apiClient).mockResolvedValue(ready(freshGames))

    await act(async () => {
      await result.current.forceRefresh()
    })

    await waitFor(() => expect(result.current.data).toEqual(freshGames))
  })

  // ── Recovery: enter ──────────────────────────────────────────────

  it('enters recovery when Steam is unavailable', async () => {
    vi.mocked(api.apiClient).mockRejectedValue(
      new SteamUnavailableError('Steam not running')
    )

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.isRecovering).toBe(true)
  })

  // ── Recovery: first success triggers forced refresh ──────────────

  it('fires a forced refresh when recovery gets its first success', async () => {
    const games = [{ id: 1, name: 'Game 1', type: 'normal', owned: true }]

    // Start with Steam unavailable
    vi.mocked(api.apiClient).mockRejectedValue(
      new SteamUnavailableError('Steam not running')
    )

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isRecovering).toBe(true))

    // Steam comes back — normal query succeeds with ready library, then forced refresh also resolves
    vi.mocked(api.apiClient).mockResolvedValue(ready(games))

    await act(async () => {
      await result.current.refetch()
    })

    // Wait for the forced refresh call (refresh=true)
    await waitFor(() => {
      expect(callsMatching('refresh=true').length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Recovery: exit only after forced refresh succeeds ────────────

  it('exits recovery only after forced refresh succeeds', async () => {
    const games = [{ id: 1, name: 'Game 1', type: 'normal', owned: true }]

    vi.mocked(api.apiClient).mockRejectedValue(
      new SteamUnavailableError('Steam not running')
    )

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isRecovering).toBe(true))

    // Normal query succeeds with ready library, forced refresh also succeeds
    vi.mocked(api.apiClient).mockResolvedValue(ready(games))

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.isRecovering).toBe(false)
      expect(result.current.data).toEqual(games)
    })
  })

  // ── Recovery: forced refresh failure keeps recovery alive ────────

  it('stays in recovery when forced refresh fails', async () => {
    // Start with Steam unavailable
    vi.mocked(api.apiClient).mockRejectedValue(
      new SteamUnavailableError('Steam not running')
    )

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isRecovering).toBe(true))

    // Normal query succeeds but forced refresh fails
    let callCount = 0
    vi.mocked(api.apiClient).mockImplementation((url) => {
      callCount++
      if (typeof url === 'string' && url.includes('refresh=true')) {
        return Promise.reject(new Error('Network error'))
      }
      return Promise.resolve(ready([]))
    })

    await act(async () => {
      await result.current.refetch()
    })

    // Give the forced refresh time to resolve
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(2))

    // Should still be recovering since forced refresh failed
    expect(result.current.isRecovering).toBe(true)
  })

  // ── Recovery: no repeated forced refreshes in one cycle ──────────

  it('does not fire repeated forced refreshes within one recovery cycle', async () => {
    // Start with Steam unavailable
    vi.mocked(api.apiClient).mockRejectedValue(
      new SteamUnavailableError('Steam not running')
    )

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isRecovering).toBe(true))

    // Resolve all calls to ready games — forced refresh will succeed
    vi.mocked(api.apiClient).mockResolvedValue(ready([]))

    // Trigger multiple refetches to simulate polling ticks
    await act(async () => {
      await result.current.refetch()
    })
    await act(async () => {
      await result.current.refetch()
    })

    // Wait for effects to settle
    await waitFor(() => expect(result.current.data).toEqual([]))

    // Only one refresh=true call should have been made per recovery cycle
    // (the guard ref prevents repeats while one is in-flight)
    const refreshCalls = callsMatching('refresh=true')
    expect(refreshCalls.length).toBe(1)
  })

  // ── Recovery: non-Steam error exits recovery ─────────────────────

  it('exits recovery on non-Steam error so the real error screen shows', async () => {
    vi.mocked(api.apiClient).mockRejectedValue(
      new SteamUnavailableError('Steam not running')
    )

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isRecovering).toBe(true))

    // Steam comes back but a different failure occurs
    vi.mocked(api.apiClient).mockRejectedValue(
      new Error('Game list download failed')
    )

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
      expect(result.current.isRecovering).toBe(false)
    })
  })

  // ── Recovery: clean reset on second Steam dropout ────────────────

  it('resets the forced-refresh guard when Steam drops out again', async () => {
    const games = [{ id: 1, name: 'Game 1', type: 'normal', owned: true }]

    // First cycle: Steam unavailable → recovery → forced refresh → exit
    vi.mocked(api.apiClient).mockRejectedValue(
      new SteamUnavailableError('Steam not running')
    )

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isRecovering).toBe(true))

    vi.mocked(api.apiClient).mockResolvedValue(ready(games))

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => expect(result.current.isRecovering).toBe(false))

    const firstCycleRefreshCount = callsMatching('refresh=true').length

    // Second cycle: Steam drops out again
    vi.mocked(api.apiClient).mockRejectedValue(
      new SteamUnavailableError('Steam not running')
    )

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => expect(result.current.isRecovering).toBe(true))

    // Steam comes back again
    vi.mocked(api.apiClient).mockResolvedValue(ready(games))

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => expect(result.current.isRecovering).toBe(false))

    // A new refresh=true call should have been made for the second cycle
    expect(callsMatching('refresh=true').length).toBeGreaterThan(firstCycleRefreshCount)
  })

  // ── Picker state contract ────────────────────────────────────────
  // PickerView branches on (isWaitingForSteam || isRecovering) to show
  // the waiting card and uses isFetching only for non-Steam error retry.
  // These tests verify the hook exposes stable values across background
  // polling ticks so the UI never flickers.

  it('keeps isRecovering stable across multiple refetch ticks', async () => {
    vi.mocked(api.apiClient).mockRejectedValue(
      new SteamUnavailableError('Steam not running')
    )

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isRecovering).toBe(true))

    // Simulate several polling ticks while Steam is still down
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.refetch().catch(() => {})
      })
    }

    // isRecovering should never have flipped during those ticks
    expect(result.current.isRecovering).toBe(true)
    expect(result.current.error).toBeTruthy()
  })

  // ── Library readiness ────────────────────────────────────────────

  it('exposes libraryReady from backend response', async () => {
    const games = [{ id: 1, name: 'Game 1', type: 'normal', owned: true }]
    vi.mocked(api.apiClient).mockResolvedValue(ready(games))

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.libraryReady).toBe(true))
    expect(result.current.data).toEqual(games)
  })

  it('reports libraryReady as false when backend says not ready', async () => {
    const partialGames = [{ id: 1, name: 'Game 1', type: 'normal', owned: true }]
    vi.mocked(api.apiClient).mockResolvedValue(notReady(partialGames))

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data).toEqual(partialGames))
    expect(result.current.libraryReady).toBe(false)
  })

  it('does not exit recovery when forced refresh returns libraryReady false', async () => {
    // Start with Steam unavailable
    vi.mocked(api.apiClient).mockRejectedValue(
      new SteamUnavailableError('Steam not running')
    )

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isRecovering).toBe(true))

    // Normal query succeeds but library not ready — should not fire forced refresh yet
    vi.mocked(api.apiClient).mockResolvedValue(notReady([{ id: 1, name: 'Game 1', type: 'normal', owned: true }]))

    await act(async () => {
      await result.current.refetch()
    })

    // Should still be recovering — libraryReady is false so no forced refresh fires
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.isRecovering).toBe(true)

    // No forced refresh should have been attempted
    expect(callsMatching('refresh=true').length).toBe(0)
  })

  it('exits recovery when library becomes ready after stabilization', async () => {
    const partialGames = [{ id: 1, name: 'Game 1', type: 'normal', owned: true }]
    const fullGames = [
      { id: 1, name: 'Game 1', type: 'normal', owned: true },
      { id: 2, name: 'Game 2', type: 'normal', owned: true },
    ]

    // Start with Steam unavailable
    vi.mocked(api.apiClient).mockRejectedValue(
      new SteamUnavailableError('Steam not running')
    )

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isRecovering).toBe(true))

    // First success: library not ready (partial)
    vi.mocked(api.apiClient).mockResolvedValue(notReady(partialGames))

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => expect(result.current.data).toEqual(partialGames))
    expect(result.current.isRecovering).toBe(true)

    // Second success: library now ready — forced refresh fires and succeeds
    vi.mocked(api.apiClient).mockResolvedValue(ready(fullGames))

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.isRecovering).toBe(false)
      expect(result.current.data).toEqual(fullGames)
      expect(result.current.libraryReady).toBe(true)
    })
  })
})
