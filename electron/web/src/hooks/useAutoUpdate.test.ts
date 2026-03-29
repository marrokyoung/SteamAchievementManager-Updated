import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoUpdate } from './useAutoUpdate'
import { toast } from '@/components/ui/use-toast'

vi.mock('@/components/ui/use-toast', () => ({
  toast: vi.fn().mockReturnValue({ dismiss: vi.fn() }),
}))

vi.mock('@/components/ui/toast', () => ({
  ToastAction: 'button',
}))

function getElectron() {
  return window.electron as unknown as Record<string, ReturnType<typeof vi.fn>>
}

describe('useAutoUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('subscribes to update-available and update-downloaded on mount', () => {
    renderHook(() => useAutoUpdate())
    const e = getElectron()
    expect(e.onUpdateAvailable).toHaveBeenCalledOnce()
    expect(e.onUpdateDownloaded).toHaveBeenCalledOnce()
  })

  it('calls checkForUpdates after subscribing', () => {
    renderHook(() => useAutoUpdate())
    expect(getElectron().checkForUpdates).toHaveBeenCalledOnce()
  })

  it('removes listeners on unmount', () => {
    const removers = {
      available: vi.fn(),
      downloaded: vi.fn(),
    }
    const e = getElectron()
    e.onUpdateAvailable.mockReturnValue(removers.available)
    e.onUpdateDownloaded.mockReturnValue(removers.downloaded)

    const { unmount } = renderHook(() => useAutoUpdate())
    unmount()

    expect(removers.available).toHaveBeenCalledOnce()
    expect(removers.downloaded).toHaveBeenCalledOnce()
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
})
