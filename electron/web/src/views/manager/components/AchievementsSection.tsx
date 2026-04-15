import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  Unlock,
  Lock,
  ArrowUpDown,
  Search,
  Trophy,
} from 'lucide-react'
import type { Achievement } from '@/types/api'
import { AchievementItem } from './AchievementItem'

interface AchievementsSectionProps {
  totalCount: number
  filteredAchievements: Achievement[]
  modifiedAchievements: Map<string, boolean>
  appId: number
  searchQuery: string
  onSearchChange: (q: string) => void
  sortOrder: 'default' | 'unlocked' | 'locked'
  onSortOrderChange: (order: 'default' | 'unlocked' | 'locked') => void
  onToggle: (id: string, unlocked: boolean) => void
  onBulkAction: (action: 'unlock' | 'lock') => void
}

export function AchievementsSection({
  totalCount,
  filteredAchievements,
  modifiedAchievements,
  appId,
  searchQuery,
  onSearchChange,
  sortOrder,
  onSortOrderChange,
  onToggle,
  onBulkAction,
}: AchievementsSectionProps) {
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
          appId={appId}
          currentValue={currentValue}
          isModified={isModified}
          onToggle={onToggle}
        />
      )
    })
  }, [filteredAchievements, modifiedAchievements, appId, onToggle])

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 space-y-2">
        <h3 className="text-lg font-semibold whitespace-nowrap">
          Achievements ({totalCount})
          {modifiedAchievements.size > 0 && (
            <span className="text-sm text-primary ml-2">
              ({modifiedAchievements.size} modified)
            </span>
          )}
        </h3>
        {totalCount > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => onBulkAction('unlock')}>
              <Unlock className="h-3 w-3 mr-1" />
              Unlock All
            </Button>
            <Button variant="outline" size="sm" onClick={() => onBulkAction('lock')}>
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
                    onSortOrderChange(value as 'default' | 'unlocked' | 'locked')
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
        {totalCount > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search by name or description..."
              className="pl-10 h-9 text-sm"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search achievements"
            />
          </div>
        )}
        {searchQuery.trim() && (
          <p className="text-xs text-muted-foreground/80">
            Showing {filteredAchievements.length} of {totalCount} achievements
          </p>
        )}
      </div>

      {totalCount === 0 ? (
        <div className="flex-1 rounded-xl sam-glass-panel p-8 text-center">
          <Trophy className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-white mb-1">No achievements</p>
          <p className="text-xs text-muted-foreground/70">
            This game doesn't have any achievements to manage.
          </p>
        </div>
      ) : filteredAchievements.length === 0 ? (
        <div className="flex-1 rounded-xl sam-glass-panel p-8 text-center">
          <Search className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-white mb-1">No matches</p>
          <p className="text-xs text-muted-foreground/70">
            No achievements match "{searchQuery.trim()}"
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
  )
}
