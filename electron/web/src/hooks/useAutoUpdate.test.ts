import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoUpdate } from './useAutoUpdate'
import { toast } from '@/components/ui/use-toast'

vi.mock('@/components/ui/use-toast', () => ({
  toast: vi.fn().mockReturnValue({ id: 'toast-1', dismiss: vi.fn(), update: vi.fn() }),
}))

vi.mock('@/components/ui/toast', () => ({
  ToastAction: 'button',
}))

vi.mock('@/lib/electronBridge', () => ({
  getElectronBridge: () => (window as any).electron,
}))

function getElectron() {
  return window.electron as unknown as Record<string, ReturnType<typeof vi.fn>>
}

describe('useAutoUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('subscribes to all updater events on mount', () => {
    renderHook(() => useAutoUpdate())
    const e = getElectron()
    expect(e.onUpdateAvailable).toHaveBeenCalledOnce()
    expect(e.onDownloadProgress).toHaveBeenCalledOnce()
    expect(e.onUpdateDownloaded).toHaveBeenCalledOnce()
    expect(e.onUpdateError).toHaveBeenCalledOnce()
  })

  it('calls checkForUpdates after subscribing', () => {
    renderHook(() => useAutoUpdate())
    expect(getElectron().checkForUpdates).toHaveBeenCalledOnce()
  })

  it('removes listeners on unmount', () => {
    const removers = {
      available: vi.fn(),
      progress: vi.fn(),
      downloaded: vi.fn(),
      error: vi.fn(),
    }
    const e = getElectron()
    e.onUpdateAvailable.mockReturnValue(removers.available)
    e.onDownloadProgress.mockReturnValue(removers.progress)
    e.onUpdateDownloaded.mockReturnValue(removers.downloaded)
    e.onUpdateError.mockReturnValue(removers.error)

    const { unmount } = renderHook(() => useAutoUpdate())
    unmount()

    expect(removers.available).toHaveBeenCalledOnce()
    expect(removers.progress).toHaveBeenCalledOnce()
    expect(removers.downloaded).toHaveBeenCalledOnce()
    expect(removers.error).toHaveBeenCalledOnce()
  })

  it('shows download toast when update-available fires', () => {
    const e = getElectron()
    let callback: (info: { version: string }) => void = () => {}
    e.onUpdateAvailable.mockImplementation((cb: typeof callback) => {
      callback = cb
      return vi.fn()
    })

    renderHook(() => useAutoUpdate())

    act(() => { callback({ version: '9.0.0' }) })

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Update available: v9.0.0',
        duration: Infinity,
      })
    )
  })

  it('shows restart toast when update-downloaded fires', () => {
    const e = getElectron()
    let callback: () => void = () => {}
    e.onUpdateDownloaded.mockImplementation((cb: typeof callback) => {
      callback = cb
      return vi.fn()
    })

    renderHook(() => useAutoUpdate())

    act(() => { callback() })

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Update ready to install',
        duration: Infinity,
      })
    )
  })

  it('shows download progress toast when download-progress fires first', () => {
    const e = getElectron()
    let callback: (progress: { percent: number; transferred: number; total: number }) => void = () => {}
    e.onDownloadProgress.mockImplementation((cb: typeof callback) => {
      callback = cb
      return vi.fn()
    })

    renderHook(() => useAutoUpdate())

    act(() => {
      callback({ percent: 42.4, transferred: 1024 * 1024, total: 4 * 1024 * 1024 })
    })

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Downloading update',
        description: '42% complete (1.0 MB of 4.0 MB)',
        duration: Infinity,
      })
    )
  })

  it('dismisses stale toast and creates fresh one on first progress event', () => {
    const e = getElectron()
    let availableCallback: (info: { version: string }) => void = () => {}
    let progressCallback: (progress: { percent: number; transferred: number; total: number }) => void = () => {}

    e.onUpdateAvailable.mockImplementation((cb: typeof availableCallback) => {
      availableCallback = cb
      return vi.fn()
    })
    e.onDownloadProgress.mockImplementation((cb: typeof progressCallback) => {
      progressCallback = cb
      return vi.fn()
    })

    const dismissMock = vi.fn()
    vi.mocked(toast).mockReturnValue({ id: 'toast-avail', dismiss: dismissMock, update: vi.fn() })

    renderHook(() => useAutoUpdate())

    // Fire update-available first (creates toast with Download action)
    act(() => { availableCallback({ version: '9.0.0' }) })

    // First progress event — should dismiss stale toast and create a fresh one
    act(() => { progressCallback({ percent: 10, transferred: 100, total: 1000 }) })

    expect(dismissMock).toHaveBeenCalled()
    const progressCall = vi.mocked(toast).mock.calls.find(
      (call) => (call[0] as any).title === 'Downloading update'
    )
    expect(progressCall).toBeDefined()
    expect((progressCall![0] as any).action).toBeUndefined()
  })

  it('updates toast in place for subsequent progress events instead of recreating', () => {
    const e = getElectron()
    let progressCallback: (progress: { percent: number; transferred: number; total: number }) => void = () => {}

    e.onDownloadProgress.mockImplementation((cb: typeof progressCallback) => {
      progressCallback = cb
      return vi.fn()
    })

    const updateMock = vi.fn()
    vi.mocked(toast).mockReturnValue({ id: 'toast-dl', dismiss: vi.fn(), update: updateMock })

    renderHook(() => useAutoUpdate())

    // First progress event creates the toast
    act(() => { progressCallback({ percent: 10, transferred: 100, total: 1000 }) })
    const toastCallCount = vi.mocked(toast).mock.calls.length

    // Second progress event should update, not create a new toast
    act(() => { progressCallback({ percent: 50, transferred: 500, total: 1000 }) })

    expect(vi.mocked(toast).mock.calls.length).toBe(toastCallCount)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Downloading update',
        description: '50% complete (500 B of 1000 B)',
        action: undefined,
        variant: undefined
      })
    )
  })

  it('shows destructive toast when updater error fires', () => {
    const e = getElectron()
    let callback: (message: string) => void = () => {}
    e.onUpdateError.mockImplementation((cb: typeof callback) => {
      callback = cb
      return vi.fn()
    })

    renderHook(() => useAutoUpdate())

    act(() => {
      callback('GitHub release metadata is unavailable')
    })

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Update failed',
        description: 'GitHub release metadata is unavailable',
        variant: 'destructive',
        duration: Infinity,
      })
    )
  })
})
