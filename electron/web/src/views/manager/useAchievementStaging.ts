import { useState, useCallback, useMemo, useDeferredValue } from 'react'
import { toast } from '@/components/ui/use-toast'
import type { Achievement, GameData } from '@/types/api'

export interface AchievementStagingState {
  /** Achievements with staged changes (id -> new unlocked value). */
  modifiedAchievements: Map<string, boolean>
  /** Current search query text. */
  searchQuery: string
  setSearchQuery: (q: string) => void
  /** Current sort order. */
  sortOrder: 'default' | 'unlocked' | 'locked'
  /** Apply a new sort order. */
  applySortOrder: (order: 'default' | 'unlocked' | 'locked') => void
  /** Filtered and sorted achievements ready to render. */
  filteredAchievements: Achievement[]
  /** Bulk action dialog state. */
  bulkActionDialogOpen: boolean
  pendingBulkAction: 'unlock' | 'lock' | null
  openBulkActionDialog: (action: 'unlock' | 'lock') => void
  closeBulkActionDialog: () => void
  handleConfirmBulkAction: () => void
  /** Toggle a single achievement. */
  handleAchievementToggle: (id: string, unlocked: boolean) => void
  /** Clear staged achievement modifications (after save/reset). */
  clearAll: () => void
}

export function useAchievementStaging(
  gameData: GameData | undefined
): AchievementStagingState {
  const [modifiedAchievements, setModifiedAchievements] = useState<Map<string, boolean>>(new Map())
  const [sortOrder, setSortOrder] = useState<'default' | 'unlocked' | 'locked'>('default')
  const [sortKey, setSortKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false)
  const [pendingBulkAction, setPendingBulkAction] = useState<'unlock' | 'lock' | null>(null)

  // Fast lookup
  const achievementsById = useMemo(
    () => new Map((gameData?.achievements ?? []).map(a => [a.id, a])),
    [gameData?.achievements]
  )

  // Capture achievement states at sort-time (only updates when sortKey changes)
  const sortSnapshot = useMemo(() => {
    const snapshot = new Map<string, boolean>()
    gameData?.achievements.forEach(a => {
      snapshot.set(a.id, modifiedAchievements.get(a.id) ?? a.isAchieved)
    })
    return snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, gameData?.achievements])

  // Sorted achievements with stable tie-breaking
  const sortedAchievements = useMemo(() => {
    if (!gameData?.achievements) return []
    const indexed = gameData.achievements.map((a, i) => ({ a, i }))
    if (sortOrder === 'default') return indexed.map(x => x.a)

    return indexed.sort((x, y) => {
      const aUnlocked = sortSnapshot.get(x.a.id) ?? x.a.isAchieved
      const bUnlocked = sortSnapshot.get(y.a.id) ?? y.a.isAchieved
      if (aUnlocked !== bUnlocked) {
        return sortOrder === 'unlocked'
          ? (bUnlocked ? 1 : 0) - (aUnlocked ? 1 : 0)
          : (aUnlocked ? 1 : 0) - (bUnlocked ? 1 : 0)
      }
      return x.i - y.i
    }).map(x => x.a)
  }, [gameData?.achievements, sortOrder, sortSnapshot])

  // Deferred query so typing stays responsive on large lists
  const deferredSearchQuery = useDeferredValue(searchQuery)

  // Pre-compute lowercase searchable text once per achievement list change
  const searchIndex = useMemo(() => {
    if (!gameData?.achievements) return new Map<string, string>()
    return new Map(
      gameData.achievements.map(a => [
        a.id,
        `${a.name}\0${a.description ?? ''}`.toLowerCase()
      ])
    )
  }, [gameData?.achievements])

  // Filter achievements by search query (applied after sorting)
  const filteredAchievements = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase()
    if (!q) return sortedAchievements
    return sortedAchievements.filter(a => searchIndex.get(a.id)?.includes(q))
  }, [sortedAchievements, deferredSearchQuery, searchIndex])

  // Toggle handler
  const handleAchievementToggle = useCallback((id: string, unlocked: boolean) => {
    const achievement = achievementsById.get(id)
    if (!achievement) return

    if (achievement.isProtected) {
      toast({
        title: 'Cannot modify achievement',
        description: 'This achievement is protected and cannot be changed.',
        variant: 'destructive'
      })
      return
    }

    setModifiedAchievements(prev => {
      const next = new Map(prev)
      if (unlocked === achievement.isAchieved) {
        next.delete(id)
      } else {
        next.set(id, unlocked)
      }
      return next
    })
  }, [achievementsById])

  // Sort
  const applySortOrder = useCallback((order: 'default' | 'unlocked' | 'locked') => {
    setSortOrder(order)
    setSortKey(k => k + 1)
  }, [])

  // Bulk actions
  const openBulkActionDialog = useCallback((action: 'unlock' | 'lock') => {
    setPendingBulkAction(action)
    setBulkActionDialogOpen(true)
  }, [])

  const closeBulkActionDialog = useCallback(() => {
    setBulkActionDialogOpen(false)
    setPendingBulkAction(null)
  }, [])

  const handleConfirmBulkAction = useCallback(() => {
    if (!gameData?.achievements || !pendingBulkAction) return

    const targetUnlocked = pendingBulkAction === 'unlock'
    const next = new Map(modifiedAchievements)
    let changed = 0

    gameData.achievements.forEach(achievement => {
      if (achievement.isProtected) return

      const currentValue = next.has(achievement.id)
        ? next.get(achievement.id)!
        : achievement.isAchieved

      if (currentValue === targetUnlocked) return

      if (targetUnlocked === achievement.isAchieved) {
        next.delete(achievement.id)
      } else {
        next.set(achievement.id, targetUnlocked)
      }

      changed++
    })

    setBulkActionDialogOpen(false)
    setPendingBulkAction(null)

    if (changed === 0) {
      toast({
        title: 'No changes needed',
        description: 'All eligible achievements already match that state.',
        variant: 'success'
      })
      return
    }

    setModifiedAchievements(next)
    toast({
      title: targetUnlocked ? 'Unlock all staged' : 'Lock all staged',
      description: 'Changes are staged. Click Save Changes to commit to Steam.',
      variant: 'success'
    })
  }, [gameData?.achievements, pendingBulkAction, modifiedAchievements])

  // Clear all staging state
  const clearAll = useCallback(() => {
    setModifiedAchievements(new Map())
  }, [])

  return {
    modifiedAchievements,
    searchQuery,
    setSearchQuery,
    sortOrder,
    applySortOrder,
    filteredAchievements,
    bulkActionDialogOpen,
    pendingBulkAction,
    openBulkActionDialog,
    closeBulkActionDialog,
    handleConfirmBulkAction,
    handleAchievementToggle,
    clearAll,
  }
}
