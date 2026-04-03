import { useState, useMemo, useDeferredValue, useCallback } from 'react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, BarChart3 } from 'lucide-react'
import type { Stat, GameData } from '@/types/api'
import type { StatValidation } from '@/lib/statValidation'
import { isRawIdStat } from '../helpers'
import { StatItem } from './StatItem'

interface StatsSectionProps {
  gameData: GameData | undefined
  originalData: GameData | null
  modifiedStats: Map<string, number>
  statValidations: Map<string, StatValidation>
  statInputs: Map<string, string>
  setStatInputs: React.Dispatch<React.SetStateAction<Map<string, string>>>
  warningCount: number
  errorCount: number
  onUpdate: (id: string, value: number) => void
  onRevert: (id: string) => void
  onClearValidation: (id: string) => void
}

export function StatsSection({
  gameData,
  originalData,
  modifiedStats,
  statValidations,
  statInputs,
  setStatInputs,
  warningCount,
  errorCount,
  onUpdate,
  onRevert,
  onClearValidation,
}: StatsSectionProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showRawStats, setShowRawStats] = useState(false)

  const deferredSearchQuery = useDeferredValue(searchQuery)

  const originalStatsById = useMemo(
    () => new Map((originalData?.stats ?? []).map(s => [s.id, s])),
    [originalData?.stats]
  )

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
    const q = deferredSearchQuery.trim().toLowerCase()
    if (!q) return gameData.stats
    return gameData.stats.filter(stat => statSearchIndex.get(stat.id)?.includes(q))
  }, [gameData?.stats, deferredSearchQuery, statSearchIndex])

  const namedStats = useMemo(
    () => filteredStats.filter(stat => !isRawIdStat(stat)),
    [filteredStats]
  )
  const rawIdStats = useMemo(
    () => filteredStats.filter(stat => isRawIdStat(stat)),
    [filteredStats]
  )
  const visibleStatsCount = showRawStats ? filteredStats.length : namedStats.length

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
        onUpdate={onUpdate}
        onRevert={onRevert}
        onClearValidation={onClearValidation}
      />
    )
  }, [
    originalStatsById,
    modifiedStats,
    statValidations,
    statInputs,
    setStatInputs,
    onUpdate,
    onRevert,
    onClearValidation
  ])

  const namedStatItems = useMemo(() => {
    if (!namedStats.length) return []
    return namedStats.map((stat, index) => buildStatItem(stat, index, 'named'))
  }, [namedStats, buildStatItem])

  const rawStatItems = useMemo(() => {
    if (!rawIdStats.length) return []
    return rawIdStats.map((stat, index) => buildStatItem(stat, index, 'raw'))
  }, [rawIdStats, buildStatItem])

  const totalCount = gameData?.stats.length ?? 0

  return (
    <div>
      <div className="mb-4 space-y-2">
        <h3 className="text-lg font-semibold flex items-center gap-2 flex-wrap">
          <span className="whitespace-nowrap">Stats ({totalCount})</span>
          {modifiedStats.size > 0 && (
            <span className="sam-badge sam-badge-modified">
              {modifiedStats.size} modified
            </span>
          )}
          {warningCount > 0 && (
            <span className="sam-badge sam-badge-warning">
              {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
            </span>
          )}
          {errorCount > 0 && (
            <span className="sam-badge sam-badge-error">
              {errorCount} {errorCount === 1 ? 'error' : 'errors'}
            </span>
          )}
        </h3>
        {totalCount > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search by stat name or ID..."
              className="pl-10 h-9 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search stats"
            />
          </div>
        )}
        {totalCount > 0 && (
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
        {searchQuery.trim() && (
          <p className="text-xs text-muted-foreground/80">
            Showing {visibleStatsCount} of {totalCount} stats
          </p>
        )}
      </div>

      {totalCount === 0 ? (
        <div className="rounded-xl sam-glass-panel p-8 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-white mb-1">No statistics</p>
          <p className="text-xs text-muted-foreground/70">
            This game doesn't have any statistics to manage.
          </p>
        </div>
      ) : filteredStats.length === 0 ? (
        <div className="rounded-xl sam-glass-panel p-8 text-center">
          <Search className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-white mb-1">No matches</p>
          <p className="text-xs text-muted-foreground/70">
            No stats match "{searchQuery.trim()}"
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
            <div className="rounded-xl sam-glass-panel p-5 text-center">
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

        </div>
      )}
    </div>
  )
}
