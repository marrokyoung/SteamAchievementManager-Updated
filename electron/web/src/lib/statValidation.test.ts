import { describe, expect, it } from 'vitest'
import {
  parseStrictInt,
  parseStrictFloat,
  parseStatValue,
  validateStatValue,
  clampStatValue,
} from './statValidation'
import type { Stat } from '@/types/api'

// ---------------------------------------------------------------------------
// parseStrictInt
// ---------------------------------------------------------------------------

describe('parseStrictInt', () => {
  it('parses plain integers', () => {
    expect(parseStrictInt('42')).toBe(42)
    expect(parseStrictInt('0')).toBe(0)
    expect(parseStrictInt('-7')).toBe(-7)
    expect(parseStrictInt('+3')).toBe(3)
  })

  it('rejects partial parses like "12abc"', () => {
    expect(parseStrictInt('12abc')).toBeNull()
    expect(parseStrictInt('abc12')).toBeNull()
    expect(parseStrictInt('1.5')).toBeNull()
    expect(parseStrictInt('1e2')).toBeNull()
  })

  it('rejects empty and whitespace-only strings', () => {
    expect(parseStrictInt('')).toBeNull()
    expect(parseStrictInt('   ')).toBeNull()
  })

  it('trims surrounding whitespace before parsing', () => {
    expect(parseStrictInt('  42  ')).toBe(42)
  })

  it('rejects Infinity and NaN representations', () => {
    expect(parseStrictInt('Infinity')).toBeNull()
    expect(parseStrictInt('-Infinity')).toBeNull()
    expect(parseStrictInt('NaN')).toBeNull()
  })

  it('rejects hex/octal notation', () => {
    expect(parseStrictInt('0x1A')).toBeNull()
    expect(parseStrictInt('0o17')).toBeNull()
    expect(parseStrictInt('0b101')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseStrictFloat
// ---------------------------------------------------------------------------

describe('parseStrictFloat', () => {
  it('parses plain floats', () => {
    expect(parseStrictFloat('3.14')).toBeCloseTo(3.14)
    expect(parseStrictFloat('0.5')).toBe(0.5)
    expect(parseStrictFloat('-2.7')).toBeCloseTo(-2.7)
    expect(parseStrictFloat('.5')).toBe(0.5)
  })

  it('parses integers as floats', () => {
    expect(parseStrictFloat('42')).toBe(42)
    expect(parseStrictFloat('0')).toBe(0)
  })

  it('rejects partial parses like "12abc"', () => {
    expect(parseStrictFloat('12abc')).toBeNull()
    expect(parseStrictFloat('abc')).toBeNull()
    expect(parseStrictFloat('1.2.3')).toBeNull()
  })

  it('rejects scientific notation', () => {
    expect(parseStrictFloat('1e2')).toBeNull()
    expect(parseStrictFloat('1E-3')).toBeNull()
  })

  it('rejects empty and whitespace-only strings', () => {
    expect(parseStrictFloat('')).toBeNull()
    expect(parseStrictFloat('   ')).toBeNull()
  })

  it('rejects Infinity and NaN', () => {
    expect(parseStrictFloat('Infinity')).toBeNull()
    expect(parseStrictFloat('NaN')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseStatValue (delegates by type)
// ---------------------------------------------------------------------------

describe('parseStatValue', () => {
  it('uses int parser for int type', () => {
    expect(parseStatValue('42', 'int')).toBe(42)
    expect(parseStatValue('3.14', 'int')).toBeNull()
  })

  it('uses float parser for float type', () => {
    expect(parseStatValue('3.14', 'float')).toBeCloseTo(3.14)
    expect(parseStatValue('42', 'float')).toBe(42)
  })

  it('rejects garbage for both types', () => {
    expect(parseStatValue('abc', 'int')).toBeNull()
    expect(parseStatValue('abc', 'float')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// validateStatValue
// ---------------------------------------------------------------------------

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

describe('validateStatValue', () => {
  it('returns null for a valid in-range value', () => {
    const stat = makeStat()
    expect(validateStatValue({ stat, value: 50, originalValue: 10 })).toBeNull()
  })

  it('returns error for protected stat', () => {
    const stat = makeStat({ isProtected: true })
    const result = validateStatValue({ stat, value: 50, originalValue: 10 })
    expect(result).toEqual({ severity: 'error', message: 'Protected stat cannot be modified' })
  })

  it('returns error for non-integer on int stat', () => {
    const stat = makeStat({ type: 'int' })
    const result = validateStatValue({ stat, value: 3.5, originalValue: 10 })
    expect(result).toEqual({ severity: 'error', message: 'Value must be an integer' })
  })

  it('returns error for NaN on float stat', () => {
    const stat = makeStat({ type: 'float' })
    const result = validateStatValue({ stat, value: NaN, originalValue: 10 })
    expect(result).toEqual({ severity: 'error', message: 'Invalid float value' })
  })

  it('returns error for Infinity on float stat', () => {
    const stat = makeStat({ type: 'float' })
    const result = validateStatValue({ stat, value: Infinity, originalValue: 10 })
    expect(result).toEqual({ severity: 'error', message: 'Invalid float value' })
  })

  it('returns error for increment-only violation', () => {
    const stat = makeStat({ incrementOnly: true })
    const result = validateStatValue({ stat, value: 5, originalValue: 10 })
    expect(result).toEqual({ severity: 'error', message: 'Cannot decrease below 10' })
  })

  it('allows increment-only stat to increase', () => {
    const stat = makeStat({ incrementOnly: true })
    expect(validateStatValue({ stat, value: 15, originalValue: 10 })).toBeNull()
  })

  it('allows increment-only stat to stay equal', () => {
    const stat = makeStat({ incrementOnly: true })
    expect(validateStatValue({ stat, value: 10, originalValue: 10 })).toBeNull()
  })

  it('returns warning for out-of-range (above max)', () => {
    const stat = makeStat({ maxValue: 100 })
    const result = validateStatValue({ stat, value: 150, originalValue: 10 })
    expect(result?.severity).toBe('warning')
    expect(result?.message).toContain('clamped')
  })

  it('returns warning for out-of-range (below min)', () => {
    const stat = makeStat({ minValue: 0 })
    const result = validateStatValue({ stat, value: -5, originalValue: 10 })
    expect(result?.severity).toBe('warning')
    expect(result?.message).toContain('clamped')
  })

  it('error takes priority over warning (increment-only + out-of-range)', () => {
    const stat = makeStat({ incrementOnly: true, minValue: 0, maxValue: 100 })
    // Value 5 is below original 10 AND in range — increment-only error wins
    const result = validateStatValue({ stat, value: 5, originalValue: 10 })
    expect(result?.severity).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// clampStatValue
// ---------------------------------------------------------------------------

describe('clampStatValue', () => {
  it('clamps value above max', () => {
    const stat = makeStat({ minValue: 0, maxValue: 100 })
    expect(clampStatValue(150, stat)).toBe(100)
  })

  it('clamps value below min', () => {
    const stat = makeStat({ minValue: 0, maxValue: 100 })
    expect(clampStatValue(-10, stat)).toBe(0)
  })

  it('does not clamp value in range', () => {
    const stat = makeStat({ minValue: 0, maxValue: 100 })
    expect(clampStatValue(50, stat)).toBe(50)
  })

  it('clamps to boundary values exactly', () => {
    const stat = makeStat({ minValue: 0, maxValue: 100 })
    expect(clampStatValue(0, stat)).toBe(0)
    expect(clampStatValue(100, stat)).toBe(100)
  })
})
