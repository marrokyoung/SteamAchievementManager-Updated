import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FatalRuntimeScreen } from './FatalRuntimeScreen'
import type { RuntimeCheck } from '@/lib/electronBridge'

describe('FatalRuntimeScreen', () => {
  it('shows "Desktop app required" for missing_bridge', () => {
    const runtime: RuntimeCheck & { ok: false } = { ok: false, reason: 'missing_bridge' }

    render(<FatalRuntimeScreen runtime={runtime} />)

    expect(screen.getByText('Desktop app required')).toBeInTheDocument()
    expect(screen.getByText(/must be launched from the Windows Electron desktop app/)).toBeInTheDocument()
  })

  it('shows "Bridge contract mismatch" with missing methods for invalid_bridge', () => {
    const runtime: RuntimeCheck & { ok: false } = {
      ok: false,
      reason: 'invalid_bridge',
      missingMethods: ['checkForUpdates', 'onUpdateError']
    }

    render(<FatalRuntimeScreen runtime={runtime} />)

    expect(screen.getByText('Bridge contract mismatch')).toBeInTheDocument()
    expect(screen.getByText(/preload bridge is missing required methods/)).toBeInTheDocument()
    expect(screen.getByText(/checkForUpdates, onUpdateError/)).toBeInTheDocument()
  })
})
