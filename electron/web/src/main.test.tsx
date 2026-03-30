import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeCheck } from '@/lib/electronBridge'

async function loadMain(runtime: RuntimeCheck) {
  vi.resetModules()
  document.body.innerHTML = '<div id="root"></div>'

  const rootRenderSpy = vi.fn()
  const createRootSpy = vi.fn(() => ({ render: rootRenderSpy }))
  const validateElectronRuntimeSpy = vi.fn(() => runtime)

  vi.doMock('react-dom/client', () => ({
    default: {
      createRoot: createRootSpy
    }
  }))

  vi.doMock('@/lib/electronBridge', () => ({
    validateElectronRuntime: validateElectronRuntimeSpy
  }))

  vi.doMock('@tanstack/react-query', async () => {
    const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
      '@tanstack/react-query'
    )

    return {
      ...actual,
      QueryClientProvider: ({ children }: { children: ReactNode }) => <>{children}</>
    }
  })

  vi.doMock('next-themes', () => ({
    ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>
  }))

  vi.doMock('./App', () => ({
    default: () => <div data-testid="app-root">App Mounted</div>
  }))

  vi.doMock('@/components/FatalRuntimeScreen', () => ({
    FatalRuntimeScreen: ({ runtime }: { runtime: RuntimeCheck & { ok: false } }) => (
      <div data-testid="fatal-runtime">{runtime.reason}</div>
    )
  }))

  await import('./main')

  expect(validateElectronRuntimeSpy).toHaveBeenCalledOnce()
  expect(createRootSpy).toHaveBeenCalledWith(document.getElementById('root'))
  expect(rootRenderSpy).toHaveBeenCalledOnce()

  return rootRenderSpy.mock.calls[0][0]
}

describe('main bootstrap', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the app when runtime validation succeeds', async () => {
    const runtime: RuntimeCheck = {
      ok: true,
      bridge: window.electron as NonNullable<Window['electron']>
    }

    const renderedTree = await loadMain(runtime)
    render(renderedTree)

    expect(screen.getByTestId('app-root')).toBeInTheDocument()
    expect(screen.queryByTestId('fatal-runtime')).not.toBeInTheDocument()
  })

  it('renders the fatal runtime screen when runtime validation fails', async () => {
    const renderedTree = await loadMain({
      ok: false,
      reason: 'invalid_bridge',
      missingMethods: ['getConfig']
    })

    render(renderedTree)

    expect(screen.getByTestId('fatal-runtime')).toHaveTextContent('invalid_bridge')
    expect(screen.queryByTestId('app-root')).not.toBeInTheDocument()
  })
})
