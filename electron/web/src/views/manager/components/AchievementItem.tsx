import { memo } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { Achievement } from '@/types/api'
import { AchievementIcon } from './AchievementIcon'

export const AchievementItem = memo(function AchievementItem({
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
        'p-4 sam-row-card flex items-center gap-3',
        'focus-visible:ring-2 focus-visible:ring-primary/50',
        isModified && 'sam-row-modified'
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
            <span className="sam-badge sam-badge-protected">
              Protected
            </span>
          )}
          {achievement.isHidden && (
            <span className="sam-badge sam-badge-neutral">
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
