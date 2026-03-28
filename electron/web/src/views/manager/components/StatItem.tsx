import { useRef } from 'react'
import type React from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseStatValue, type StatValidation } from '@/lib/statValidation'
import type { Stat } from '@/types/api'
import { isRawIdStat } from '../helpers'

export function StatItem({
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
      // Invalid input: revert display to current value
      setStatInputs(prev => {
        const next = new Map(prev)
        next.delete(stat.id)
        return next
      })
      // Clear stale validations the same way the idle (text === undefined) branch does:
      // - Errors are about the rejected edit → always stale.
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
        'p-4 sam-row-card',
        'focus-within:ring-2 focus-within:ring-primary/50',
        isModified && 'sam-row-modified',
        isError && 'border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.2)]',
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
              className="sam-badge sam-badge-raw-id"
              title="Game schema has no display name; showing internal ID."
            >
              Raw ID
            </span>
          )}
          {stat.isProtected && (
            <span className="sam-badge sam-badge-protected">
              Protected
            </span>
          )}
          {stat.incrementOnly && (
            <span className="sam-badge sam-badge-accent">
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
