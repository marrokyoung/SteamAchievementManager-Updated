import { useEffect, useState, useRef, useMemo, useDeferredValue, useCallback, memo } from 'react'
import type React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useUnsavedChanges } from '@/contexts/UnsavedChangesContext'
import {
  useGameData,
  useUpdateAchievements,
  useUpdateStats,
  useStoreChanges,
  useResetStats
} from '@/hooks/useGameQueries'
import { updateAPIConfig } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import {
  parseStatValue,
  validateStatValue,
  clampStatValue,
  type StatValidation,
} from '@/lib/statValidation'
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  AlertCircle,
  Lock,
  Unlock,
  Trophy,
  BarChart3,
  ArrowUpDown,
  Search,
  Undo2
} from 'lucide-react'
import type { GameData, Achievement, Stat } from '@/types/api'

// Cache successfully loaded icon URLs so reordered lists don't flash placeholders.
const loadedAchievementIconUrls = new Set<string>()

function buildAchievementIconUrl(appId: number, iconPath: string | null): string | null {
  if (!iconPath) return null
  if (iconPath.startsWith('http')) return iconPath
  return `https://cdn.steamstatic.com/steamcommunity/public/images/apps/${appId}/${iconPath}`
}

function isRawIdStat(stat: Pick<Stat, 'id' | 'displayName'>): boolean {
  const displayName = stat.displayName?.trim() || stat.id
  return displayName.toLowerCase() === stat.id.toLowerCase() || /^stat_\d+$/i.test(displayName)
}

export default function ManagerView() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()

  // Guard against missing or invalid appId
  const numericAppId = appId ? Number(appId) : NaN

  // State management
  const [originalData, setOriginalData] = useState<GameData | null>(null)
  const [modifiedAchievements, setModifiedAchievements] = useState<Map<string, boolean>>(new Map())
  const [modifiedStats, setModifiedStats] = useState<Map<string, number>>(new Map())
  const [statValidations, setStatValidations] = useState<Map<string, StatValidation>>(new Map())
  const [statInputs, setStatInputs] = useState<Map<string, string>>(new Map())
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [includeAchievements, setIncludeAchievements] = useState(false)
  const [serviceReady, setServiceReady] = useState(false)
  const [sortOrder, setSortOrder] = useState<'default' | 'unlocked' | 'locked'>('default')
  const [sortKey, setSortKey] = useState(0)
  const [achievementSearchQuery, setAchievementSearchQuery] = useState('')
  const [statSearchQuery, setStatSearchQuery] = useState('')
  const [showRawStats, setShowRawStats] = useState(false)
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false)
  const [pendingBulkAction, setPendingBulkAction] = useState<'unlock' | 'lock' | null>(null)

  // Queries and mutations - only enable after service is ready
  const { data: gameData, isLoading, error, refetch, isRefetching } = useGameData(numericAppId, serviceReady)
  const updateAchievementsMutation = useUpdateAchievements(numericAppId)
  const updateStatsMutation = useUpdateStats(numericAppId)
  const storeChangesMutation = useStoreChanges(numericAppId)
  const resetMutation = useResetStats(numericAppId)

  // Derived state
  const hasChanges = modifiedAchievements.size > 0 || modifiedStats.size > 0
  const hasErrors = useMemo(() => {
    for (const v of statValidations.values()) {
      if (v.severity === 'error') return true
    }
    return false
  }, [statValidations])
  const warningCount = useMemo(() => {
    let count = 0
    for (const v of statValidations.values()) {
      if (v.severity === 'warning') count++
    }
    return count
  }, [statValidations])
  const errorCount = useMemo(() => {
    let count = 0
    for (const v of statValidations.values()) {
      if (v.severity === 'error') count++
    }
    return count
  }, [statValidations])
  const isSaving =
    updateAchievementsMutation.isPending ||
    updateStatsMutation.isPending ||
    storeChangesMutation.isPending

  // Sync unsaved-changes flag to context so Layout's back button can prompt
  const { setHasUnsavedChanges, isNavigatingBack } = useUnsavedChanges()
  useEffect(() => {
    setHasUnsavedChanges(hasChanges)
  }, [hasChanges, setHasUnsavedChanges])
  useEffect(() => {
    return () => setHasUnsavedChanges(false)
  }, [setHasUnsavedChanges])

  // Fast lookup maps used by handlers and derived render data
  const achievementsById = useMemo(
    () => new Map((gameData?.achievements ?? []).map(a => [a.id, a])),
    [gameData?.achievements]
  )
  const statsById = useMemo(
    () => new Map((gameData?.stats ?? []).map(s => [s.id, s])),
    [gameData?.stats]
  )
  const originalStatsById = useMemo(
    () => new Map((originalData?.stats ?? []).map(s => [s.id, s])),
    [originalData?.stats]
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
  const deferredSearchQuery = useDeferredValue(achievementSearchQuery)

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

  const deferredStatSearchQuery = useDeferredValue(statSearchQuery)

  // Pre-compute lowercase searchable text once per stat list change
  const statSearchIndex = useMemo(() => {
    if (!gameData?.stats) return new Map<string, string>()
    return new Map(
      gameData.stats.map(stat => [
        stat.id,
        `${stat.displayName}\0${stat.id}`.toLowerCase()
      ])
    )
  }, [gameData?.stats])

  // Filter stats by search query
  const filteredStats = useMemo(() => {
    if (!gameData?.stats) return []
    const q = deferredStatSearchQuery.trim().toLowerCase()
    if (!q) return gameData.stats
    return gameData.stats.filter(stat => statSearchIndex.get(stat.id)?.includes(q))
  }, [gameData?.stats, deferredStatSearchQuery, statSearchIndex])

  const namedStats = useMemo(
    () => filteredStats.filter(stat => !isRawIdStat(stat)),
    [filteredStats]
  )
  const rawIdStats = useMemo(
    () => filteredStats.filter(stat => isRawIdStat(stat)),
    [filteredStats]
  )
  const visibleStatsCount = showRawStats ? filteredStats.length : namedStats.length

  // Sync originalData on every refetch
  useEffect(() => {
    if (gameData) {
      setOriginalData(gameData)
      // Reset input text to match current values
      setStatInputs(new Map())
    }
  }, [gameData])

  useEffect(() => {
    if (!appId || isNaN(numericAppId)) {
      navigate('/')
      return
    }

    const ensureServiceInitialized = async () => {
      try {
        const bridge = window.electron
        if (!bridge?.startServiceForApp) {
          // Browser mode - no service restart needed
          setServiceReady(true)
          return
        }

        // If service already running for this app, reuse current config
        const current = await bridge.getCurrentAppId?.()
        if (current && current.appId === numericAppId) {
          updateAPIConfig({ baseUrl: current.baseUrl, token: current.token })
          setServiceReady(true)
          return
        }

        // Restart service to ensure clean state and correct forced mode
        const result = await bridge.startServiceForApp(numericAppId)

        // CRITICAL: Update API config with new token before any data fetch
        updateAPIConfig({ baseUrl: result.baseUrl, token: result.token })

        // Signal that service is ready and queries can fire
        setServiceReady(true)
      } catch (err) {
        const errorMessage = (err as Error).message || ''

        // If restart already in progress, fall back to getConfig to pick up current token
        if (errorMessage.includes('restart already in progress')) {
          console.warn('Service restart in progress, using current config')
          try {
            const bridge = window.electron
            if (bridge?.getConfig) {
              const config = await bridge.getConfig()
              updateAPIConfig({ baseUrl: config.baseUrl, token: config.token })
              setServiceReady(true)
              return
            }
          } catch (fallbackErr) {
            console.error('Failed to get config:', fallbackErr)
          }
        }

        console.error('Failed to initialize service:', err)
        toast({
          title: 'Initialization Error',
          description: 'Failed to start service for this game',
          variant: 'destructive'
        })
        navigate('/')
      }
    }

    ensureServiceInitialized()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, numericAppId, navigate])

  // Clear icon cache when switching games so it doesn't grow indefinitely across sessions
  useEffect(() => {
    loadedAchievementIconUrls.clear()
  }, [numericAppId])

  // Achievement toggle handler
  const handleAchievementToggle = useCallback((id: string, unlocked: boolean) => {
    const achievement = achievementsById.get(id)
    if (!achievement) return

    // Client-side protected check
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

      // If returning to original value, remove from modified map
      if (unlocked === achievement.isAchieved) {
        next.delete(id)
      } else {
        next.set(id, unlocked)
      }

      return next
    })
  }, [achievementsById])

  // Stat update handler with severity-aware validation
  const handleStatUpdate = useCallback((id: string, value: number) => {
    const stat = statsById.get(id)
    const originalStat = originalStatsById.get(id)
    if (!stat) return

    const originalValue = originalStat?.value ?? stat.value
    const validation = validateStatValue({ stat, value, originalValue })

    // Blocking errors: set validation and do NOT stage the value
    if (validation?.severity === 'error') {
      setStatValidations(prev => new Map(prev).set(id, validation))
      return
    }

    // Warnings (out-of-range): clamp client-side, keep warning visible
    let stagedValue = value
    if (validation?.severity === 'warning') {
      stagedValue = clampStatValue(value, stat)
      setStatValidations(prev => new Map(prev).set(id, validation))
    } else {
      // Clear any previous validation for this stat
      setStatValidations(prev => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    }

    // Update modified stats
    const isUnchanged = stagedValue === stat.value
    setModifiedStats(prev => {
      const next = new Map(prev)
      if (isUnchanged) {
        next.delete(id)
      } else {
        next.set(id, stagedValue)
      }
      return next
    })

    // If clamping brought value back to current, clear the warning too
    if (isUnchanged && validation?.severity === 'warning') {
      setStatValidations(prev => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    }
  }, [statsById, originalStatsById])

  // Revert a single stat to its current (server) value
  const handleStatRevert = useCallback((id: string) => {
    setModifiedStats(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setStatValidations(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setStatInputs(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  // Clear only the validation for a stat (preserves staged value)
  const handleClearStatValidation = useCallback((id: string) => {
    setStatValidations(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  // Render-heavy list JSX is memoized so typing in search doesn't remap unchanged lists
  const achievementItems = useMemo(() => {
    return filteredAchievements.map(achievement => {
      const isModified = modifiedAchievements.has(achievement.id)
      const currentValue = isModified
        ? modifiedAchievements.get(achievement.id)!
        : achievement.isAchieved

      return (
        <AchievementItem
          key={achievement.id}
          achievement={achievement}
          appId={numericAppId}
          currentValue={currentValue}
          isModified={isModified}
          onToggle={handleAchievementToggle}
        />
      )
    })
  }, [filteredAchievements, modifiedAchievements, numericAppId, handleAchievementToggle])

  const buildStatItem = useCallback((stat: Stat, index: number, group: 'named' | 'raw') => {
      const originalStat = originalStatsById.get(stat.id)
      const isModified = modifiedStats.has(stat.id)
      const validation = statValidations.get(stat.id)

      return (
        <StatItem
          key={`${group}-${stat.id}-${index}`}
          stat={stat}
          originalValue={originalStat?.value ?? stat.value}
          isModified={isModified}
          validation={validation}
          modifiedStats={modifiedStats}
          statInputs={statInputs}
          setStatInputs={setStatInputs}
          onUpdate={handleStatUpdate}
          onRevert={handleStatRevert}
          onClearValidation={handleClearStatValidation}
        />
      )
  }, [
    originalStatsById,
    modifiedStats,
    statValidations,
    statInputs,
    setStatInputs,
    handleStatUpdate,
    handleStatRevert,
    handleClearStatValidation
  ])

  const namedStatItems = useMemo(() => {
    if (!namedStats.length) return []
    return namedStats.map((stat, index) => buildStatItem(stat, index, 'named'))
  }, [namedStats, buildStatItem])

  const rawStatItems = useMemo(() => {
    if (!rawIdStats.length) return []
    return rawIdStats.map((stat, index) => buildStatItem(stat, index, 'raw'))
  }, [
    rawIdStats,
    buildStatItem
  ])

  // Save flow
  const handleSave = async () => {
    if (!hasChanges) return

    try {
      // Step 1: Update achievements only if modified
      if (modifiedAchievements.size > 0) {
        const updates = Array.from(modifiedAchievements.entries()).map(([id, unlocked]) => ({
          id,
          unlocked
        }))
        await updateAchievementsMutation.mutateAsync(updates)
      }

      // Step 2: Update stats only if modified
      if (modifiedStats.size > 0) {
        const updates = Array.from(modifiedStats.entries()).map(([id, value]) => ({ id, value }))
        await updateStatsMutation.mutateAsync(updates)
      }

      // Step 3: Commit to Steam
      if (modifiedAchievements.size > 0 || modifiedStats.size > 0) {
        await storeChangesMutation.mutateAsync()
      }

      // Step 4: Clear local state
      setModifiedAchievements(new Map())
      setModifiedStats(new Map())
      setStatValidations(new Map())
      setStatInputs(new Map())

      // Step 5: Show success toast
      toast({
        title: 'Changes saved',
        description: 'Your modifications have been committed to Steam.',
        variant: 'success'
      })
    } catch (error) {
      toast({
        title: 'Save failed',
        description: (error as Error).message,
        variant: 'destructive'
      })
    }
  }

  // Reset flow
  const handleReset = async () => {
    try {
      await resetMutation.mutateAsync(includeAchievements)

      // Clear local state immediately
      setModifiedAchievements(new Map())
      setModifiedStats(new Map())
      setStatValidations(new Map())
      setStatInputs(new Map())

      toast({
        title: 'Stats reset',
        description: includeAchievements
          ? 'Stats and achievements have been reset.'
          : 'Stats have been reset to default values.',
        variant: 'default'
      })

      setResetDialogOpen(false)
    } catch (error) {
      toast({
        title: 'Reset failed',
        description: (error as Error).message,
        variant: 'destructive'
      })
    }
  }

  // Bulk operations
  const openBulkActionDialog = (action: 'unlock' | 'lock') => {
    setPendingBulkAction(action)
    setBulkActionDialogOpen(true)
  }

  const handleConfirmBulkAction = () => {
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
  }

  // Loading overlay
  const showLoadingOverlay = isSaving || isRefetching || resetMutation.isPending || isNavigatingBack

  // Show fetch error
  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="max-w-md mx-auto text-center py-12">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Failed to load game</h2>
          <p className="text-muted-foreground mb-4">{(error as Error).message}</p>
          <p className="text-sm text-muted-foreground mb-6">
            Make sure Steam is running and you own this game.
          </p>
          <Button onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Game Selection
          </Button>
        </div>
      </div>
    )
  }

  // Show loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading game data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      {/* Loading overlay */}
      {showLoadingOverlay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-sm">
              {isSaving && 'Saving changes...'}
              {isRefetching && 'Refreshing data...'}
              {resetMutation.isPending && 'Resetting stats...'}
              {isNavigatingBack && 'Returning to game picker...'}
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">{gameData?.gameName}</h2>
          <p className="text-sm text-muted-foreground">App ID: {appId}</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!hasChanges || hasErrors || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>

          <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Reset Stats</Button>
            </DialogTrigger>
            <DialogContent className="rounded-xl border border-white/10 bg-white/5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle>Reset Statistics</DialogTitle>
                <DialogDescription>
                  This will reset all statistics to their default values. This action cannot be
                  undone.
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center space-x-2">
                <Switch
                  id="achievements"
                  checked={includeAchievements}
                  onCheckedChange={setIncludeAchievements}
                />
                <label htmlFor="achievements" className="text-sm cursor-pointer">
                  Also reset achievements
                </label>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReset}
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending ? 'Resetting...' : 'Reset'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={bulkActionDialogOpen}
            onOpenChange={(open) => {
              setBulkActionDialogOpen(open)
              if (!open) {
                setPendingBulkAction(null)
              }
            }}
          >
            <DialogContent className="rounded-xl border border-white/10 bg-white/5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle>
                  {pendingBulkAction === 'unlock'
                    ? 'Unlock all achievements?'
                    : 'Lock all achievements?'}
                </DialogTitle>
                <DialogDescription>
                  {pendingBulkAction === 'unlock'
                    ? 'Confirming will stage all non-protected achievements as unlocked.'
                    : 'Confirming will stage all non-protected achievements as locked.'}
                </DialogDescription>
              </DialogHeader>

              <p className="text-sm text-muted-foreground">
                This does not commit to Steam immediately. Click <strong>Save Changes</strong> after
                confirming to apply everything.
              </p>

              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkActionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant={pendingBulkAction === 'lock' ? 'destructive' : 'default'}
                  onClick={handleConfirmBulkAction}
                >
                  {pendingBulkAction === 'unlock' ? 'Stage Unlock All' : 'Stage Lock All'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isRefetching} aria-label="Refresh data">
                  <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh data</p>
              </TooltipContent>
            </Tooltip>

          </TooltipProvider>
        </div>
      </div>

      {/* Content area */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Achievements Section */}
        <div>
          <div className="mb-4 space-y-2">
            <h3 className="text-lg font-semibold whitespace-nowrap">
              Achievements ({gameData?.achievements.length || 0})
              {modifiedAchievements.size > 0 && (
                <span className="text-sm text-primary ml-2">
                  ({modifiedAchievements.size} modified)
                </span>
              )}
            </h3>
            {(gameData?.achievements.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => openBulkActionDialog('unlock')}>
                  <Unlock className="h-3 w-3 mr-1" />
                  Unlock All
                </Button>
                <Button variant="outline" size="sm" onClick={() => openBulkActionDialog('lock')}>
                  <Lock className="h-3 w-3 mr-1" />
                  Lock All
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <ArrowUpDown className="h-3 w-3 mr-1" />
                      Sort
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuRadioGroup
                      value={sortOrder}
                      onValueChange={(value) => {
                        setSortOrder(value as 'default' | 'unlocked' | 'locked')
                        setSortKey(k => k + 1)
                      }}
                    >
                      <DropdownMenuRadioItem value="default">
                        Default Order
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="unlocked">
                        Unlocked First
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="locked">
                        Locked First
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            {(gameData?.achievements.length ?? 0) > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search by name or description..."
                  className="pl-10 h-9 text-sm"
                  value={achievementSearchQuery}
                  onChange={(e) => setAchievementSearchQuery(e.target.value)}
                  aria-label="Search achievements"
                />
              </div>
            )}
            {achievementSearchQuery.trim() && (
              <p className="text-xs text-muted-foreground/80">
                Showing {filteredAchievements.length} of {gameData?.achievements.length || 0} achievements
              </p>
            )}
          </div>

          {(gameData?.achievements.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
              <Trophy className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-white mb-1">No achievements</p>
              <p className="text-xs text-muted-foreground/70">
                This game doesn't have any achievements to manage.
              </p>
            </div>
          ) : filteredAchievements.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
              <Search className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-white mb-1">No matches</p>
              <p className="text-xs text-muted-foreground/70">
                No achievements match "{achievementSearchQuery.trim()}"
              </p>
            </div>
          ) : (
            <TooltipProvider delayDuration={400}>
              <div className="space-y-2">
                {achievementItems}
              </div>
            </TooltipProvider>
          )}
        </div>

        {/* Stats Section */}
        <div>
          <div className="mb-4 space-y-2">
            <h3 className="text-lg font-semibold flex items-center gap-2 flex-wrap">
              <span className="whitespace-nowrap">Stats ({gameData?.stats.length || 0})</span>
              {modifiedStats.size > 0 && (
                <span className="text-xs bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-md">
                  {modifiedStats.size} modified
                </span>
              )}
              {warningCount > 0 && (
                <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-md">
                  {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
                </span>
              )}
              {errorCount > 0 && (
                <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md">
                  {errorCount} {errorCount === 1 ? 'error' : 'errors'}
                </span>
              )}
            </h3>
            {(gameData?.stats.length ?? 0) > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search by stat name or ID..."
                  className="pl-10 h-9 text-sm"
                  value={statSearchQuery}
                  onChange={(e) => setStatSearchQuery(e.target.value)}
                  aria-label="Search stats"
                />
              </div>
            )}
            {(gameData?.stats.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant={showRawStats ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setShowRawStats(prev => !prev)}
                >
                  {showRawStats ? 'Hide Raw Stats' : 'Show Raw Stats (Advanced)'}
                </Button>
                <span className="text-xs text-muted-foreground/80">
                  {namedStats.length} named, {rawIdStats.length} raw ID
                </span>
              </div>
            )}
            {statSearchQuery.trim() && (
              <p className="text-xs text-muted-foreground/80">
                Showing {visibleStatsCount} of {gameData?.stats.length || 0} stats
              </p>
            )}
          </div>

          {(gameData?.stats.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
              <BarChart3 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-white mb-1">No statistics</p>
              <p className="text-xs text-muted-foreground/70">
                This game doesn't have any statistics to manage.
              </p>
            </div>
          ) : filteredStats.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
              <Search className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-white mb-1">No matches</p>
              <p className="text-xs text-muted-foreground/70">
                No stats match "{statSearchQuery.trim()}"
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {namedStatItems.length > 0 && (
                <div className="space-y-2">
                  {namedStatItems}
                </div>
              )}

              {!showRawStats && rawIdStats.length > 0 && namedStatItems.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-center shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                  <p className="text-sm font-medium text-white mb-1">Raw ID stats hidden</p>
                  <p className="text-xs text-muted-foreground/70">
                    {rawIdStats.length} matching stats only expose internal IDs. Enable
                    {' '}<strong>Show Raw Stats (Advanced)</strong>{' '}
                    to inspect them.
                  </p>
                </div>
              )}

              {showRawStats && rawStatItems.length > 0 && (
                <details className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                  <summary className="cursor-pointer select-none text-sm font-medium text-amber-200">
                    Raw ID Stats ({rawStatItems.length})
                  </summary>
                  <p className="text-xs text-amber-100/80 mt-2 mb-3">
                    Game schema has no display name for these stats. Internal IDs are shown as-is.
                  </p>
                  <div className="space-y-2">
                    {rawStatItems}
                  </div>
                </details>
              )}

              {!showRawStats && namedStatItems.length === 0 && rawIdStats.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                  <Search className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-medium text-white mb-1">No matches</p>
                  <p className="text-xs text-muted-foreground/70">
                    No named stats match "{statSearchQuery.trim()}"
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Achievement icon component with CDN URL and fallback
function AchievementIcon({
  appId,
  iconNormal,
  iconLocked,
  isUnlocked,
  name
}: {
  appId: number
  iconNormal: string | null
  iconLocked: string | null
  isUnlocked: boolean
  name: string
}) {
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [fallbackToLocked, setFallbackToLocked] = useState(false)

  // Prefer the normal icon for consistency; only fall back to locked if needed.
  const primaryIconPath = iconNormal || iconLocked
  const canFallbackToLocked = !isUnlocked && iconNormal && iconLocked
  const iconPath = canFallbackToLocked && fallbackToLocked ? iconLocked : primaryIconPath

  // Primary URL (without fallback) used to seed load state from cache.
  const primaryImageUrl = buildAchievementIconUrl(appId, primaryIconPath)
  const imageUrl = buildAchievementIconUrl(appId, iconPath)

  // Reset state when icon changes
  useEffect(() => {
    setImageError(false)
    setFallbackToLocked(false)
    setImageLoaded(primaryImageUrl ? loadedAchievementIconUrls.has(primaryImageUrl) : false)
  }, [primaryImageUrl])

  // If fallback URL is already cached, show it immediately.
  useEffect(() => {
    if (imageUrl && loadedAchievementIconUrls.has(imageUrl)) {
      setImageLoaded(true)
    }
  }, [imageUrl])

  // No icon available - show placeholder
  if (!imageUrl || imageError) {
    return (
      <div className="w-12 h-12 rounded-lg bg-transparent flex items-center justify-center flex-shrink-0">
        <Trophy className="w-6 h-6 text-muted-foreground/40" />
      </div>
    )
  }

  return (
    <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-transparent">
      {/* Placeholder visible until loaded */}
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Trophy className="w-6 h-6 text-muted-foreground/40" />
        </div>
      )}

      <img
        src={imageUrl}
        alt={`${name} icon`}
        loading="lazy"
        className={cn(
          'w-full h-full object-cover transition-opacity duration-200',
          imageLoaded ? 'opacity-100' : 'opacity-0',
          // Desaturate locked achievements slightly
          !isUnlocked && 'grayscale-[30%] opacity-70'
        )}
        onLoad={(e) => {
          loadedAchievementIconUrls.add(e.currentTarget.currentSrc || e.currentTarget.src)
          setImageLoaded(true)
        }}
        onError={() => {
          if (canFallbackToLocked && !fallbackToLocked) {
            setFallbackToLocked(true)
            setImageLoaded(false)
            return
          }
          setImageError(true)
        }}
      />
    </div>
  )
}

// Achievement item component
const AchievementItem = memo(function AchievementItem({
  achievement,
  appId,
  currentValue,
  isModified,
  onToggle
}: {
  achievement: Achievement
  appId: number
  currentValue: boolean
  isModified: boolean
  onToggle: (id: string, unlocked: boolean) => void
}) {
  return (
    <div
      className={cn(
        'p-4 rounded-xl border transition-all duration-200 flex items-center gap-3',
        'bg-gradient-to-br from-[#221239] via-[#140d26] to-[#0c0818]',
        'border-white/10 shadow-[0_10px_35px_rgba(0,0,0,0.4)]',
        'backdrop-blur-sm',
        'focus-visible:ring-2 focus-visible:ring-primary/50',
        // Modified state: purple accent
        isModified && 'border-primary/50 shadow-[0_0_20px_rgba(168,85,247,0.25)]',
        isModified && 'bg-gradient-to-br from-[#2b1a4a] via-[#1b1235] to-[#120b24]'
      )}
    >
      {/* Achievement Icon */}
      <AchievementIcon
        appId={appId}
        iconNormal={achievement.iconNormal}
        iconLocked={achievement.iconLocked}
        isUnlocked={currentValue}
        name={achievement.name}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'font-medium truncate min-w-0',
              achievement.isProtected && 'text-red-400'
            )}
          >
            {achievement.name}
          </p>
          {achievement.isProtected && (
            <span className="shrink-0 text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md">
              Protected
            </span>
          )}
          {achievement.isHidden && (
            <span className="shrink-0 text-xs bg-white/5 text-muted-foreground border border-white/10 px-2 py-0.5 rounded-md">
              Hidden
            </span>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <p
              className="text-sm text-muted-foreground line-clamp-2 cursor-default"
            >
              {achievement.description}
            </p>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p>{achievement.description}</p>
          </TooltipContent>
        </Tooltip>
        {achievement.unlockTime && (
          <p className="text-xs text-muted-foreground/70 mt-1">
            Unlocked: {new Date(achievement.unlockTime).toLocaleString()}
          </p>
        )}
      </div>

      <Switch
        className="data-[state=unchecked]:bg-zinc-700/80 data-[state=checked]:shadow-[0_0_12px_rgba(168,85,247,0.5)]"
        thumbClassName="data-[state=unchecked]:bg-zinc-400 data-[state=checked]:bg-white"
        checked={currentValue}
        onCheckedChange={checked => onToggle(achievement.id, checked)}
        disabled={achievement.isProtected}
      />
    </div>
  )
})

// Stat item component
function StatItem({
  stat,
  originalValue,
  isModified,
  validation,
  modifiedStats,
  statInputs,
  setStatInputs,
  onUpdate,
  onRevert,
  onClearValidation
}: {
  stat: Stat
  originalValue: number
  isModified: boolean
  validation?: StatValidation
  modifiedStats: Map<string, number>
  statInputs: Map<string, string>
  setStatInputs: React.Dispatch<React.SetStateAction<Map<string, string>>>
  onUpdate: (id: string, value: number) => void
  onRevert: (id: string) => void
  onClearValidation: (id: string) => void
}) {
  // Keyboard handlers (Enter/Escape) fully handle commit/revert, but
  // blur() fires synchronously afterward and would re-run commitInput
  // with stale closure state. This ref skips the redundant blur commit.
  const skipNextBlurCommitRef = useRef(false)

  const displayName = stat.displayName?.trim() || stat.id
  const isRawId = isRawIdStat(stat)
  const inputValue =
    statInputs.get(stat.id) ??
    (isModified ? modifiedStats.get(stat.id)!.toString() : stat.value.toString())

  const commitInput = () => {
    if (skipNextBlurCommitRef.current) {
      skipNextBlurCommitRef.current = false
      return
    }

    const text = statInputs.get(stat.id)

    if (text === undefined) {
      // Nothing typed — clear stale validations:
      // - Errors are about rejected edits → always stale once input is idle.
      // - Warnings on unmodified stats → stale (nothing staged).
      // - Warnings on modified stats → keep (describes the staged clamped value).
      if (validation?.severity === 'error') {
        if (isModified) {
          onClearValidation(stat.id)
        } else {
          onRevert(stat.id)
        }
      } else if (validation && !isModified) {
        onRevert(stat.id)
      }
      return
    }

    const parsed = parseStatValue(text, stat.type)

    if (parsed === null) {
      // Invalid input: revert to current value
      setStatInputs(prev => {
        const next = new Map(prev)
        next.delete(stat.id)
        return next
      })
      return
    }

    // Valid parse: update modifiedStats and clear input text
    onUpdate(stat.id, parsed)
    setStatInputs(prev => {
      const next = new Map(prev)
      next.delete(stat.id)
      return next
    })
  }

  const revertInput = () => {
    // Discard in-flight text, restore displayed value
    setStatInputs(prev => {
      const next = new Map(prev)
      next.delete(stat.id)
      return next
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStatInputs(prev => new Map(prev).set(stat.id, e.target.value))
  }

  const handleBlur = () => commitInput()

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitInput()
      skipNextBlurCommitRef.current = true
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      skipNextBlurCommitRef.current = true
      revertInput()
      e.currentTarget.blur()
    }
  }

  const isError = validation?.severity === 'error'
  const isWarning = validation?.severity === 'warning'

  return (
    <div
      className={cn(
        'p-4 rounded-xl border transition-all duration-200',
        'bg-gradient-to-br from-[#221239] via-[#140d26] to-[#0c0818]',
        'border-white/10 shadow-[0_10px_35px_rgba(0,0,0,0.4)]',
        'backdrop-blur-sm',
        'focus-within:ring-2 focus-within:ring-primary/50',
        // Modified state: purple accent
        isModified && 'border-primary/50 shadow-[0_0_20px_rgba(168,85,247,0.25)]',
        isModified && 'bg-gradient-to-br from-[#2b1a4a] via-[#1b1235] to-[#120b24]',
        // Validation error: red glow
        isError && 'border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.2)]',
        // Validation warning: amber glow
        isWarning && !isError && 'border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn('font-medium', stat.isProtected && 'text-red-400')}>
            {displayName}
          </p>
          {isRawId && (
            <span
              className="text-xs bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-md"
              title="Game schema has no display name; showing internal ID."
            >
              Raw ID
            </span>
          )}
          {stat.isProtected && (
            <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md">
              Protected
            </span>
          )}
          {stat.incrementOnly && (
            <span className="text-xs bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-md">
              Only Increases
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Type: {stat.type}</span>
          {isModified && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onRevert(stat.id)}
                    className="text-muted-foreground hover:text-white transition-colors p-0.5 rounded"
                    aria-label={`Revert ${displayName}`}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Revert to {stat.value}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground/70 mb-2 gap-2">
        <span className="truncate" title={stat.id}>
          ID: {stat.id}
        </span>
        {isModified && <span>Original: {originalValue}</span>}
      </div>

      <Input
        type="text"
        inputMode={stat.type === 'float' ? 'decimal' : 'numeric'}
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={stat.isProtected}
        className={cn(
          isError && 'border-red-500/60',
          isWarning && !isError && 'border-amber-500/50'
        )}
      />

      <div className="flex justify-between text-xs text-muted-foreground/70 mt-1">
        <span>Min: {stat.minValue}</span>
        <span>Max: {stat.maxValue}</span>
      </div>

      {stat.incrementOnly && (
        <p className="text-xs text-primary/85 mt-1">
          Must be &gt;= current value ({originalValue}).
        </p>
      )}

      {validation && (
        <p className={cn(
          'text-xs mt-1',
          isError ? 'text-red-400' : 'text-amber-300'
        )}>
          {validation.message}
        </p>
      )}
    </div>
  )
}
