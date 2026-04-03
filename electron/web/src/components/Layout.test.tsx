import { useEffect } from 'react'
import { act } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Layout from '@/components/Layout'
import { UnsavedChangesProvider, useUnsavedChanges } from '@/contexts/UnsavedChangesContext'
import { updateAPIConfig } from '@/lib/api'
import { toast } from '@/components/ui/use-toast'

vi.mock('@/lib/api', () => ({
  updateAPIConfig: vi.fn(),
}))

vi.mock('@/components/ui/use-toast', () => ({
  toast: vi.fn(),
}))

vi.mock('@/hooks/useAutoUpdate', () => ({
  useAutoUpdate: vi.fn(),
}))

vi.mock('@/lib/electronBridge', () => ({
  getElectronBridge: () => (window as any).electron,
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="pathname">{location.pathname}</div>
}

function UnsavedChangesSeeder({ value }: { value: boolean }) {
  const { setHasUnsavedChanges } = useUnsavedChanges()

  useEffect(() => {
    setHasUnsavedChanges(value)
  }, [setHasUnsavedChanges, value])

  return null
}

function renderLayout(options: {
  initialEntries: string[]
  initialIndex?: number
  hasUnsavedChanges?: boolean
}) {
  const { initialEntries, initialIndex, hasUnsavedChanges = false } = options

  return render(
    <UnsavedChangesProvider>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <UnsavedChangesSeeder value={hasUnsavedChanges} />
        <LocationProbe />
        <Layout>
          <div>Test Content</div>
        </Layout>
      </MemoryRouter>
    </UnsavedChangesProvider>
  )
}

function getBackButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /back/i }) as HTMLButtonElement
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('Layout back navigation', () => {
  beforeEach(() => {
    vi.mocked(updateAPIConfig).mockClear()
    vi.mocked(toast).mockClear()
  })

  it('keeps non-manager behavior and navigates history back', async () => {
    const restartMock = (window as any).electron.restartServiceNeutral as ReturnType<typeof vi.fn>
    restartMock.mockResolvedValue({ success: true, baseUrl: 'http://localhost:3000', token: 't1' })

    renderLayout({
      initialEntries: ['/', '/settings'],
      initialIndex: 1,
    })

    fireEvent.click(getBackButton())

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/')
    })
    expect(restartMock).not.toHaveBeenCalled()
  })

  it('restarts neutral service and updates API config on manager route', async () => {
    const restartMock = (window as any).electron.restartServiceNeutral as ReturnType<typeof vi.fn>
    restartMock.mockResolvedValue({ success: true, baseUrl: 'http://localhost:3000', token: 'token-123' })

    renderLayout({
      initialEntries: ['/manager/730'],
      hasUnsavedChanges: false,
    })

    fireEvent.click(getBackButton())

    await waitFor(() => {
      expect(restartMock).toHaveBeenCalledTimes(1)
      expect(updateAPIConfig).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:3000',
        token: 'token-123',
      })
      expect(screen.getByTestId('pathname')).toHaveTextContent('/')
    })
  })

  it('prompts when manager route has unsaved changes and stay does not navigate', async () => {
    const restartMock = (window as any).electron.restartServiceNeutral as ReturnType<typeof vi.fn>
    restartMock.mockResolvedValue({ success: true, baseUrl: 'http://localhost:3000', token: 'token-123' })

    renderLayout({
      initialEntries: ['/manager/730'],
      hasUnsavedChanges: true,
    })

    fireEvent.click(getBackButton())

    expect(await screen.findByText('Unsaved Changes')).toBeInTheDocument()
    expect(restartMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))

    await waitFor(() => {
      expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument()
      expect(screen.getByTestId('pathname')).toHaveTextContent('/manager/730')
    })
    expect(restartMock).not.toHaveBeenCalled()
  })

  it('uses atomic guard to avoid concurrent restart calls', async () => {
    const restartMock = (window as any).electron.restartServiceNeutral as ReturnType<typeof vi.fn>
    const inFlight = deferred<{ success: boolean; baseUrl: string; token: string }>()
    restartMock.mockReturnValue(inFlight.promise)

    renderLayout({
      initialEntries: ['/manager/730'],
      hasUnsavedChanges: false,
    })

    const backButton = getBackButton()
    act(() => {
      fireEvent.click(backButton)
      fireEvent.click(backButton)
    })

    expect(restartMock).toHaveBeenCalledTimes(1)

    inFlight.resolve({ success: true, baseUrl: 'http://localhost:3000', token: 'token-456' })

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/')
    })
  })

  it('Leave button clears unsaved changes and triggers manager back', async () => {
    const restartMock = (window as any).electron.restartServiceNeutral as ReturnType<typeof vi.fn>
    restartMock.mockResolvedValue({ success: true, baseUrl: 'http://localhost:3000', token: 'token-leave' })

    renderLayout({
      initialEntries: ['/manager/730'],
      hasUnsavedChanges: true,
    })

    fireEvent.click(getBackButton())
    expect(await screen.findByText('Unsaved Changes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))

    await waitFor(() => {
      expect(restartMock).toHaveBeenCalledTimes(1)
      expect(updateAPIConfig).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:3000',
        token: 'token-leave',
      })
      expect(screen.getByTestId('pathname')).toHaveTextContent('/')
    })

    expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument()
  })

  it('shows generic error and navigates to picker when a bridge method disappears at runtime', async () => {
    // Bridge was valid at mount (useAutoUpdate validated and cached it).
    // Deleting a method after mount simulates a runtime failure, not a
    // missing-bridge scenario — so the generic error handler fires.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      renderLayout({
        initialEntries: ['/manager/730'],
        hasUnsavedChanges: false,
      })

      // Remove method AFTER the bridge was cached at mount
      delete (window as any).electron.restartServiceNeutral

      fireEvent.click(getBackButton())

      await waitFor(() => {
        expect(screen.getByTestId('pathname')).toHaveTextContent('/')
      })
      expect(updateAPIConfig).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledWith('Failed to restart service:', expect.any(TypeError))
      expect(toast).toHaveBeenCalledWith({
        title: 'Warning',
        description: 'Service restart failed. Navigating to picker anyway.',
        variant: 'destructive',
      })
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('shows destructive toast and navigates to picker when restart fails', async () => {
    const restartMock = (window as any).electron.restartServiceNeutral as ReturnType<typeof vi.fn>
    restartMock.mockRejectedValue(new Error('IPC channel closed'))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      renderLayout({
        initialEntries: ['/manager/730'],
        hasUnsavedChanges: false,
      })

      fireEvent.click(getBackButton())

      await waitFor(() => {
        expect(screen.getByTestId('pathname')).toHaveTextContent('/')
      })

      expect(errorSpy).toHaveBeenCalledWith('Failed to restart service:', expect.any(Error))
      expect(toast).toHaveBeenCalledWith({
        title: 'Warning',
        description: 'Service restart failed. Navigating to picker anyway.',
        variant: 'destructive',
      })
      expect(updateAPIConfig).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })
})
