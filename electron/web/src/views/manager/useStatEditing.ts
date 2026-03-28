import { useState, useCallback, useMemo } from 'react'
import {
  validateStatValue,
  clampStatValue,
  type StatValidation,
} from '@/lib/statValidation'
import type { GameData } from '@/types/api'

export interface StatEditingState {
  /** Stats that have been staged with new values (id -> staged value). */
  modifiedStats: Map<string, number>
  /** Current validation messages keyed by stat id. */
  statValidations: Map<string, StatValidation>
  /** Raw text the user has typed but not yet committed (id -> text). */
  statInputs: Map<string, string>
  /** True when at least one stat has a blocking validation error. */
  hasErrors: boolean
  /** Number of stats with non-blocking warnings. */
  warningCount: number
  /** Number of stats with blocking errors. */
  errorCount: number

  // --- Actions ---

  /** Stage a parsed value, running validation first. */
  handleStatUpdate: (id: string, value: number) => void
  /** Revert a single stat to its server value (clears staged value, validation, and input text). */
  handleStatRevert: (id: string) => void
  /** Clear only the validation for a stat (preserves any staged value). */
  handleClearStatValidation: (id: string) => void
  /** Update raw input text for a stat. */
  setStatInputs: React.Dispatch<React.SetStateAction<Map<string, string>>>
  /** Reset all stat editing state (after save/reset). */
  clearAll: () => void
}

export function useStatEditing(
  gameData: GameData | undefined,
  originalData: GameData | null
): StatEditingState {
  const [modifiedStats, setModifiedStats] = useState<Map<string, number>>(new Map())
  const [statValidations, setStatValidations] = useState<Map<string, StatValidation>>(new Map())
  const [statInputs, setStatInputs] = useState<Map<string, string>>(new Map())

  // Fast lookups
  const statsById = useMemo(
    () => new Map((gameData?.stats ?? []).map(s => [s.id, s])),
    [gameData?.stats]
  )
  const originalStatsById = useMemo(
    () => new Map((originalData?.stats ?? []).map(s => [s.id, s])),
    [originalData?.stats]
  )

  // Derived counts
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

  // Reset all stat editing state
  const clearAll = useCallback(() => {
    setModifiedStats(new Map())
    setStatValidations(new Map())
    setStatInputs(new Map())
  }, [])

  return {
    modifiedStats,
    statValidations,
    statInputs,
    hasErrors,
    warningCount,
    errorCount,
    handleStatUpdate,
    handleStatRevert,
    handleClearStatValidation,
    setStatInputs,
    clearAll,
  }
}
