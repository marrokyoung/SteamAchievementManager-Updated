import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, isSteamUnavailableError } from '@/lib/api'
import type {
  GameData,
  GameListResponse,
  AchievementUpdate,
  StatUpdate
} from '@/types/api'

const STEAM_RECOVERY_REFETCH_INTERVAL_MS = 1500

export function useGames(includeUnowned = false, enabled = true) {
  const queryClient = useQueryClient()
  const [isRecovering, setIsRecovering] = useState(false)
  const forceRefreshFiredRef = useRef(false)

  const query = useQuery({
    queryKey: ['games', includeUnowned],
    queryFn: ({ signal }) =>
      apiClient<GameListResponse>(
        `/api/games?includeUnowned=${includeUnowned}`,
        { signal }
      ),
    enabled,
    retry: (failureCount, error) =>
      !isSteamUnavailableError(error) && failureCount < 3,
    // Poll while Steam is down, recovery is in progress, or library hasn't stabilized.
    refetchInterval: (query) =>
      isSteamUnavailableError(query.state.error) || isRecovering ||
      (query.state.data && !query.state.data.libraryReady)
        ? STEAM_RECOVERY_REFETCH_INTERVAL_MS
        : false,
    refetchIntervalInBackground: true
  })

  const isWaitingForSteam = isSteamUnavailableError(query.error)
  const libraryReady = query.data?.libraryReady ?? false

  // Recovery state machine:
  //   enter  — Steam-unavailable error appears
  //   stay   — until a forced refresh succeeds with libraryReady === true
  //   exit   — forced refresh succeeds with ready library, OR a non-Steam error occurs
  useEffect(() => {
    let cancelled = false
    let controller: AbortController | null = null
    const cleanup = () => {
      cancelled = true
      controller?.abort()
    }

    if (!enabled) {
      return cleanup
    }

    if (isWaitingForSteam) {
      setIsRecovering(true)
      forceRefreshFiredRef.current = false
      return cleanup
    }

    if (!isRecovering) return cleanup

    // Non-Steam error during recovery — exit so the real error screen shows
    if (query.error) {
      setIsRecovering(false)
      return cleanup
    }

    // First successful response with a ready library means Steam is fully loaded.
    // Fire one forced refresh to bypass the server cache — this is the same
    // path the manual refresh button uses.  Recovery only exits when it succeeds
    // AND the library is marked ready.
    if (query.data && libraryReady && !forceRefreshFiredRef.current) {
      forceRefreshFiredRef.current = true
      controller = new AbortController()
      apiClient<GameListResponse>(
        `/api/games?includeUnowned=${includeUnowned}&refresh=true`,
        { signal: controller.signal }
      )
        .then((response) => {
          // Effect was invalidated while request was in flight — re-arm so
          // the next effect run can fire a fresh forced refresh.
          if (cancelled) { forceRefreshFiredRef.current = false; return }
          queryClient.setQueryData(['games', includeUnowned], response)
          if (response.libraryReady) {
            setIsRecovering(false)
          } else {
            // Forced refresh came back not-ready — allow polling to retry
            forceRefreshFiredRef.current = false
          }
        })
        .catch(() => {
          // AbortError is expected on cleanup; re-arm either way so recovery isn't stuck.
          forceRefreshFiredRef.current = false
        })
    }

    return cleanup
  }, [isWaitingForSteam, isRecovering, query.error, query.data, libraryReady, includeUnowned, enabled, queryClient])

  // Manual force-refresh: bypasses the server cache then updates query data directly
  const forceRefresh = useCallback(async () => {
    const response = await apiClient<GameListResponse>(
      `/api/games?includeUnowned=${includeUnowned}&refresh=true`
    )
    queryClient.setQueryData(['games', includeUnowned], response)
  }, [includeUnowned, queryClient])

  return {
    ...query,
    data: query.data?.games,
    libraryReady,
    isFetched: query.isFetched,
    forceRefresh,
    isRecovering
  }
}

export function useGameData(appId: number, serviceReady: boolean = true) {
  return useQuery({
    queryKey: ['gameData', appId],
    queryFn: () => apiClient<GameData>(`/api/game/${appId}/data`),
    enabled: serviceReady && appId > 0
  })
}

export function useUpdateAchievements(appId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (updates: AchievementUpdate[]) =>
      apiClient(`/api/game/${appId}/achievements`, {
        method: 'POST',
        body: JSON.stringify({ updates })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameData', appId] })
    }
  })
}

export function useUpdateStats(appId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (updates: StatUpdate[]) =>
      apiClient(`/api/game/${appId}/stats`, {
        method: 'POST',
        body: JSON.stringify({ updates })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameData', appId] })
    }
  })
}

export function useStoreChanges(appId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiClient(`/api/game/${appId}/store`, {
        method: 'POST',
        body: JSON.stringify({})
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameData', appId] })
    }
  })
}

export function useResetStats(appId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (achievementsToo: boolean) =>
      apiClient(`/api/game/${appId}/reset`, {
        method: 'POST',
        body: JSON.stringify({ achievementsToo })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameData', appId] })
    }
  })
}
