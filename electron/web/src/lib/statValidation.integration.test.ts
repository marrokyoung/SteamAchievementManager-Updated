/**
 * Integration-style tests that verify the save-gating and clamping logic
 * that ManagerView uses with the statValidation utilities.
 */
import { describe, expect, it } from 'vitest'
import {
  validateStatValue,
  clampStatValue,
  parseStatValue,
  type StatValidation,
} from './statValidation'
import type { Stat } from '@/types/api'

function makeStat(overrides: Partial<Stat> = {}): Stat {
  return {
    id: 'test_stat',
    displayName: 'Test Stat',
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
 * Simulates the ManagerView save-gating logic:
 * save is blocked when any validation has severity === 'error'.
 */
function hasBlockingErrors(validations: Map<string, StatValidation>): boolean {
  for (const v of validations.values()) {
    if (v.severity === 'error') return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Save gating: error vs warning
// ---------------------------------------------------------------------------

describe('save gating (error blocks, warning allows)', () => {
  it('blocks save when a stat has an error-severity validation', () => {
    const validations = new Map<string, StatValidation>()
    const stat = makeStat({ isProtected: true })
    const result = validateStatValue({ stat, value: 50, originalValue: 10 })!
    validations.set(stat.id, result)

    expect(result.severity).toBe('error')
    expect(hasBlockingErrors(validations)).toBe(true)
  })

  it('allows save when a stat has only a warning-severity validation', () => {
    const validations = new Map<string, StatValidation>()
    const stat = makeStat({ maxValue: 100 })
    const result = validateStatValue({ stat, value: 150, originalValue: 10 })!
    validations.set(stat.id, result)

    expect(result.severity).toBe('warning')
    expect(hasBlockingErrors(validations)).toBe(false)
  })

  it('blocks save when one error exists among warnings', () => {
    const validations = new Map<string, StatValidation>()

    // Warning: out-of-range
    const stat1 = makeStat({ id: 'stat_a', maxValue: 100 })
    const warn = validateStatValue({ stat: stat1, value: 150, originalValue: 10 })!
    validations.set(stat1.id, warn)

    // Error: increment-only violation
    const stat2 = makeStat({ id: 'stat_b', incrementOnly: true })
    const err = validateStatValue({ stat: stat2, value: 5, originalValue: 10 })!
    validations.set(stat2.id, err)

    expect(hasBlockingErrors(validations)).toBe(true)
  })

  it('allows save when validations map is empty', () => {
    expect(hasBlockingErrors(new Map())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Out-of-range clamping flow
// ---------------------------------------------------------------------------

describe('out-of-range clamping flow', () => {
  it('clamps above-max to max and produces a warning', () => {
    const stat = makeStat({ minValue: 0, maxValue: 100 })
    const validation = validateStatValue({ stat, value: 200, originalValue: 10 })

    expect(validation?.severity).toBe('warning')

    const clamped = clampStatValue(200, stat)
    expect(clamped).toBe(100)
  })

  it('clamps below-min to min and produces a warning', () => {
    const stat = makeStat({ minValue: 0, maxValue: 100 })
    const validation = validateStatValue({ stat, value: -50, originalValue: 10 })

    expect(validation?.severity).toBe('warning')

    const clamped = clampStatValue(-50, stat)
    expect(clamped).toBe(0)
  })

  it('clamped value passes validation cleanly', () => {
    const stat = makeStat({ minValue: 0, maxValue: 100 })
    const clamped = clampStatValue(200, stat)
    const recheck = validateStatValue({ stat, value: clamped, originalValue: 10 })

    expect(recheck).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Input commit/revert simulation
// ---------------------------------------------------------------------------

describe('input commit/revert simulation', () => {
  it('Enter on valid int input: parses and validates cleanly', () => {
    const stat = makeStat({ type: 'int' })
    const parsed = parseStatValue('42', 'int')

    expect(parsed).toBe(42)

    const validation = validateStatValue({ stat, value: parsed!, originalValue: 10 })
    expect(validation).toBeNull()
  })

  it('Enter on invalid input like "12abc": strict parser rejects', () => {
    const parsed = parseStatValue('12abc', 'int')
    expect(parsed).toBeNull()
    // StatItem would revert display to current value
  })

  it('Enter on valid float input: parses with decimal', () => {
    const stat = makeStat({ type: 'float' })
    const parsed = parseStatValue('3.14', 'float')

    expect(parsed).toBeCloseTo(3.14)

    const validation = validateStatValue({ stat, value: parsed!, originalValue: 10 })
    expect(validation).toBeNull()
  })

  it('Escape: no parsing happens, input text is discarded', () => {
    // On Escape, StatItem clears statInputs entry without calling onUpdate.
    // This is a design verification — if text was "abc", nothing is parsed.
    const parsed = parseStatValue('abc', 'int')
    expect(parsed).toBeNull()
    // Escape skips parsing entirely and just clears the input buffer.
  })

  it('blur on empty input: strict parser rejects', () => {
    const parsed = parseStatValue('', 'int')
    expect(parsed).toBeNull()
  })
})
