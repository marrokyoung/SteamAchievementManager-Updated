import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import type {
  Game,
  GameData,
  AchievementUpdate,
  StatUpdate
} from '@/types/api'

export function useGames(includeUnowned = false, refresh = false) {
  return useQuery({
    queryKey: ['games', includeUnowned, refresh],
    queryFn: () =>
      apiClient<Game[]>(
        `/api/games?includeUnowned=${includeUnowned}&refresh=${refresh}`
      )
  })
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
