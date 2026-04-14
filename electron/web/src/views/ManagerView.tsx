import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useUnsavedChanges } from '@/contexts/UnsavedChangesContext'
import {
  useGameData,
  useUpdateAchievements,
  useUpdateStats,
  useStoreChanges,
  useResetStats
} from '@/hooks/useGameQueries'
import { Button } from '@/components/ui/button'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import type { GameData } from '@/types/api'

import { useManagerService } from './manager/useManagerService'
import { useAchievementStaging } from './manager/useAchievementStaging'
import { useStatEditing } from './manager/useStatEditing'
import { clearAchievementIconCache } from './manager/components/AchievementIcon'
import { AchievementsSection } from './manager/components/AchievementsSection'
import { StatsSection } from './manager/components/StatsSection'

export default function ManagerView() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()

  // Guard against missing or invalid appId
  const numericAppId = appId ? Number(appId) : NaN

  // Service bootstrap
  const serviceReady = useManagerService(appId, numericAppId)

  // Queries and mutations - only enable after service is ready
  const { data: gameData, isLoading, error, refetch, isRefetching } = useGameData(numericAppId, serviceReady)
  const updateAchievementsMutation = useUpdateAchievements(numericAppId)
  const updateStatsMutation = useUpdateStats(numericAppId)
  const storeChangesMutation = useStoreChanges(numericAppId)
  const resetMutation = useResetStats(numericAppId)

  // Track original data for stat revert comparisons
  const [originalData, setOriginalData] = useState<GameData | null>(null)

  // Achievement staging
  const achievements = useAchievementStaging(gameData)

  // Stat editing
  const stats = useStatEditing(gameData, originalData)

  // Reset dialog state (owned by route because it triggers cross-cutting reset)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [includeAchievements, setIncludeAchievements] = useState(false)

  // Derived cross-cutting state
  const hasChanges = achievements.modifiedAchievements.size > 0 || stats.modifiedStats.size > 0
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

  // Sync originalData on every refetch
  useEffect(() => {
    if (gameData) {
      setOriginalData(gameData)
      // Reset input text to match current values
      stats.setStatInputs(new Map())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameData])

  // Clear icon cache and staged edits when switching games
  useEffect(() => {
    clearAchievementIconCache()
    achievements.clearAll()
    stats.clearAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericAppId])

  // Save flow
  const handleSave = async () => {
    if (!hasChanges) return

    try {
      // Step 1: Update achievements only if modified
      if (achievements.modifiedAchievements.size > 0) {
        const updates = Array.from(achievements.modifiedAchievements.entries()).map(([id, unlocked]) => ({
          id,
          unlocked
        }))
        await updateAchievementsMutation.mutateAsync(updates)
      }

      // Step 2: Update stats only if modified
      if (stats.modifiedStats.size > 0) {
        const updates = Array.from(stats.modifiedStats.entries()).map(([id, value]) => ({ id, value }))
        await updateStatsMutation.mutateAsync(updates)
      }

      // Step 3: Commit to Steam
      if (achievements.modifiedAchievements.size > 0 || stats.modifiedStats.size > 0) {
        await storeChangesMutation.mutateAsync()
      }

      // Step 4: Clear local state
      achievements.clearAll()
      stats.clearAll()

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

      achievements.clearAll()
      stats.clearAll()

      toast({
        title: 'Progress reset',
        description: includeAchievements
          ? 'Stats and achievements have been reset on Steam.'
          : 'Stats have been reset to default values on Steam.',
        variant: 'default'
      })

      setResetDialogOpen(false)
      setIncludeAchievements(false)
    } catch (error) {
      toast({
        title: 'Reset failed',
        description: (error as Error).message,
        variant: 'destructive'
      })
    }
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

  // Show loading (includes pre-service-ready state when query is disabled)
  if (isLoading || !serviceReady) {
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
          <Button onClick={handleSave} disabled={!hasChanges || stats.hasErrors || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              achievements.clearAll()
              stats.clearAll()
              toast({
                title: 'Edits discarded',
                description: 'All unsaved changes have been reverted.',
                variant: 'default'
              })
            }}
            disabled={!hasChanges}
          >
            Discard Edits
          </Button>

          <Dialog open={resetDialogOpen} onOpenChange={(open) => {
            setResetDialogOpen(open)
            if (!open) setIncludeAchievements(false)
          }}>
            <DialogTrigger asChild>
              <Button variant="destructive">Reset Progress</Button>
            </DialogTrigger>
            <DialogContent className="sam-glass-panel">
              <DialogHeader>
                <DialogTitle>Reset Progress on Steam</DialogTitle>
                <DialogDescription>
                  This will permanently reset your progress on Steam. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <p id="reset-scope-label" className="text-sm font-medium text-foreground">What would you like to reset?</p>
                <div
                  role="radiogroup"
                  aria-labelledby="reset-scope-label"
                  className="flex flex-col gap-2"
                >
                  {([false, true] as const).map((value) => {
                    const selected = includeAchievements === value
                    const handleArrow = (e: React.KeyboardEvent<HTMLDivElement>) => {
                      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault()
                        setIncludeAchievements(prev => !prev)
                        // Wrap: with two options, the other radio is always the
                        // sibling. Use querySelectorAll on the group to avoid
                        // e.target landing on a child element.
                        const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')
                        if (radios) {
                          const other = radios[value ? 0 : 1]
                          other?.focus()
                        }
                      } else if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        setIncludeAchievements(value)
                      }
                    }
                    return (
                      <div
                        key={String(value)}
                        role="radio"
                        aria-checked={selected}
                        tabIndex={selected ? 0 : -1}
                        className={cn(
                          'flex items-center gap-3 w-full rounded-lg px-4 py-3 text-left transition-colors border cursor-pointer',
                          selected
                            ? 'border-[#8b5cf6] bg-[#8b5cf6]/10 text-foreground'
                            : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10'
                        )}
                        onClick={() => setIncludeAchievements(value)}
                        onKeyDown={handleArrow}
                      >
                        <div className={cn(
                          'h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0',
                          selected ? 'border-[#8b5cf6]' : 'border-white/30'
                        )}>
                          {selected && <div className="h-2 w-2 rounded-full bg-[#8b5cf6]" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{value ? 'Stats + achievements' : 'Stats only'}</p>
                          <p className="text-xs text-muted-foreground">
                            {value ? 'Reset statistics and lock all achievements' : 'Reset all statistics to their default values'}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
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

          {/* Bulk action confirmation dialog */}
          <Dialog
            open={achievements.bulkActionDialogOpen}
            onOpenChange={(open) => {
              if (!open) achievements.closeBulkActionDialog()
            }}
          >
            <DialogContent className="sam-glass-panel">
              <DialogHeader>
                <DialogTitle>
                  {achievements.pendingBulkAction === 'unlock'
                    ? 'Unlock all achievements?'
                    : 'Lock all achievements?'}
                </DialogTitle>
                <DialogDescription>
                  {achievements.pendingBulkAction === 'unlock'
                    ? 'Confirming will stage all non-protected achievements as unlocked.'
                    : 'Confirming will stage all non-protected achievements as locked.'}
                </DialogDescription>
              </DialogHeader>

              <p className="text-sm text-muted-foreground">
                This does not commit to Steam immediately. Click <strong>Save Changes</strong> after
                confirming to apply everything.
              </p>

              <DialogFooter>
                <Button variant="outline" onClick={achievements.closeBulkActionDialog}>
                  Cancel
                </Button>
                <Button
                  variant={achievements.pendingBulkAction === 'lock' ? 'destructive' : 'default'}
                  onClick={achievements.handleConfirmBulkAction}
                >
                  {achievements.pendingBulkAction === 'unlock' ? 'Stage Unlock All' : 'Stage Lock All'}
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
        <AchievementsSection
          totalCount={gameData?.achievements.length ?? 0}
          filteredAchievements={achievements.filteredAchievements}
          modifiedAchievements={achievements.modifiedAchievements}
          appId={numericAppId}
          searchQuery={achievements.searchQuery}
          onSearchChange={achievements.setSearchQuery}
          sortOrder={achievements.sortOrder}
          onSortOrderChange={achievements.applySortOrder}
          onToggle={achievements.handleAchievementToggle}
          onBulkAction={achievements.openBulkActionDialog}
        />

        <StatsSection
          gameData={gameData}
          originalData={originalData}
          modifiedStats={stats.modifiedStats}
          statValidations={stats.statValidations}
          statInputs={stats.statInputs}
          setStatInputs={stats.setStatInputs}
          warningCount={stats.warningCount}
          errorCount={stats.errorCount}
          onUpdate={stats.handleStatUpdate}
          onRevert={stats.handleStatRevert}
          onClearValidation={stats.handleClearStatValidation}
        />
      </div>
    </div>
  )
}
