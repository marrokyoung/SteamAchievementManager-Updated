import { useState, useCallback } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Stat } from '@/types/api'
import type { StatValidation } from '@/lib/statValidation'
import { StatItem } from './StatItem'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStat(overrides?: Partial<Stat>): Stat {
  return {
    id: 'stat_kills',
    displayName: 'Total Kills',
    type: 'int',
    value: 10,
    minValue: 0,
    maxValue: 100,
    incrementOnly: false,
    isProtected: false,
    ...overrides,
  }
}

/**
 * Tiny harness that owns the mutable Maps StatItem reads/writes,
 * plus pre-seeds a staged value and validation if provided.
 */
function StatItemHarness({
  stat,
  initialStagedValue,
  initialValidation,
}: {
  stat: Stat
  initialStagedValue?: number
  initialValidation?: StatValidation
}) {
  const [modifiedStats, setModifiedStats] = useState<Map<string, number>>(
    () => initialStagedValue !== undefined
      ? new Map([[stat.id, initialStagedValue]])
      : new Map()
  )
  const [statValidations, setStatValidations] = useState<Map<string, StatValidation>>(
    () => initialValidation
      ? new Map([[stat.id, initialValidation]])
      : new Map()
  )
  const [statInputs, setStatInputs] = useState<Map<string, string>>(new Map())

  const isModified = modifiedStats.has(stat.id)
  const validation = statValidations.get(stat.id)

  const handleUpdate = useCallback((id: string, value: number) => {
    setModifiedStats(prev => new Map(prev).set(id, value))
    // For simplicity, clear validation on successful update
    setStatValidations(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const handleRevert = useCallback((id: string) => {
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

  const handleClearValidation = useCallback((id: string) => {
    setStatValidations(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  return (
    <StatItem
      stat={stat}
      originalValue={stat.value}
      isModified={isModified}
      validation={validation}
      modifiedStats={modifiedStats}
      statInputs={statInputs}
      setStatInputs={setStatInputs}
      onUpdate={handleUpdate}
      onRevert={handleRevert}
      onClearValidation={handleClearValidation}
    />
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StatItem', () => {
  it('preserves warning when invalid text is typed and blurred on a staged clamped stat', async () => {
    const user = userEvent.setup()
    const stat = makeStat({ value: 10, minValue: 0, maxValue: 100 })

    // Pre-seed: stat was edited to 100 (clamped from e.g. 200), with a warning
    render(
      <StatItemHarness
        stat={stat}
        initialStagedValue={100}
        initialValidation={{ severity: 'warning', message: 'Value clamped to [0, 100]' }}
      />
    )

    // Verify initial state: input shows 100, warning visible
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('100')
    expect(screen.getByText('Value clamped to [0, 100]')).toBeInTheDocument()

    // Type invalid text and blur
    await user.clear(input)
    await user.type(input, 'abc')
    await user.tab()

    // Input should snap back to the staged value
    expect(input).toHaveValue('100')
    // Warning should still be visible (not cleared)
    expect(screen.getByText('Value clamped to [0, 100]')).toBeInTheDocument()
  })

  it('clears error validation when invalid text is typed on an unmodified stat', async () => {
    const user = userEvent.setup()
    const stat = makeStat({ value: 10, incrementOnly: true })

    // Pre-seed: an error from a previous rejected edit (e.g. tried to decrease)
    render(
      <StatItemHarness
        stat={stat}
        initialValidation={{ severity: 'error', message: 'Cannot decrease below 10' }}
      />
    )

    const input = screen.getByRole('textbox')
    expect(screen.getByText('Cannot decrease below 10')).toBeInTheDocument()

    // Type invalid text and blur
    await user.clear(input)
    await user.type(input, 'xyz')
    await user.tab()

    // Input reverts to current value, error should be cleared
    expect(input).toHaveValue('10')
    expect(screen.queryByText('Cannot decrease below 10')).not.toBeInTheDocument()
  })

  it('clears error but keeps staged value when error is on a modified stat', async () => {
    const user = userEvent.setup()
    const stat = makeStat({ value: 10 })

    // Pre-seed: stat is staged at 50, but has an error from a subsequent rejected edit
    render(
      <StatItemHarness
        stat={stat}
        initialStagedValue={50}
        initialValidation={{ severity: 'error', message: 'Value must be an integer' }}
      />
    )

    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('50')
    expect(screen.getByText('Value must be an integer')).toBeInTheDocument()

    // Type invalid text and blur
    await user.clear(input)
    await user.type(input, '!!!')
    await user.tab()

    // Input reverts to staged value, error cleared
    expect(input).toHaveValue('50')
    expect(screen.queryByText('Value must be an integer')).not.toBeInTheDocument()
  })
})
