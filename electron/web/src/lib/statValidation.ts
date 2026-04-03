import type { Stat } from '@/types/api'

// ---------------------------------------------------------------------------
// Severity model
// ---------------------------------------------------------------------------

export type ValidationSeverity = 'error' | 'warning'

export interface StatValidation {
  severity: ValidationSeverity
  message: string
}

// ---------------------------------------------------------------------------
// Strict numeric parsing
// ---------------------------------------------------------------------------

/**
 * Parse a string as a strict integer.
 * Rejects partial parses (e.g. "12abc"), leading/trailing whitespace-only strings,
 * Infinity, and NaN.
 */
export function parseStrictInt(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null

  // Reject anything that isn't an optional sign followed by digits
  if (!/^[+-]?\d+$/.test(trimmed)) return null

  const value = Number(trimmed)

  if (!Number.isFinite(value)) return null
  if (!Number.isInteger(value)) return null

  return value
}

/**
 * Parse a string as a strict float.
 * Rejects partial parses (e.g. "12abc"), leading/trailing whitespace-only strings,
 * Infinity, and NaN.
 */
export function parseStrictFloat(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null

  // Reject anything that isn't a valid decimal number (optional sign, digits, optional decimal)
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null

  const value = Number(trimmed)

  if (!Number.isFinite(value)) return null

  return value
}

/**
 * Parse a stat value string using the stat's type to choose int vs float parsing.
 */
export function parseStatValue(text: string, type: 'int' | 'float'): number | null {
  return type === 'int' ? parseStrictInt(text) : parseStrictFloat(text)
}

// ---------------------------------------------------------------------------
// Stat validation
// ---------------------------------------------------------------------------

export interface ValidateStatOptions {
  stat: Stat
  value: number
  originalValue: number
}

/**
 * Validate a parsed stat value and return an error or warning if applicable.
 *
 * Severity rules:
 * - **error** (blocks save): protected, invalid type, increment-only violation
 * - **warning** (non-blocking): out-of-range (value will be clamped client-side)
 *
 * Returns `null` when the value is fully valid.
 */
export function validateStatValue({ stat, value, originalValue }: ValidateStatOptions): StatValidation | null {
  // Protected – should never reach here, but guard anyway
  if (stat.isProtected) {
    return { severity: 'error', message: 'Protected stat cannot be modified' }
  }

  // Type check – int stat must receive an integer
  if (stat.type === 'int' && !Number.isInteger(value)) {
    return { severity: 'error', message: 'Value must be an integer' }
  }

  // NaN / Infinity guard for floats
  if (stat.type === 'float' && (!Number.isFinite(value))) {
    return { severity: 'error', message: 'Invalid float value' }
  }

  // Increment-only: cannot decrease below original value
  if (stat.incrementOnly && value < originalValue) {
    return { severity: 'error', message: `Cannot decrease below ${originalValue}` }
  }

  // Out-of-range: non-blocking warning (value will be clamped before staging)
  if (value < stat.minValue || value > stat.maxValue) {
    return {
      severity: 'warning',
      message: `Value clamped to [${stat.minValue}, ${stat.maxValue}]`
    }
  }

  return null
}

/**
 * Clamp a value to the stat's [minValue, maxValue] range.
 */
export function clampStatValue(value: number, stat: Stat): number {
  return Math.min(Math.max(value, stat.minValue), stat.maxValue)
}
