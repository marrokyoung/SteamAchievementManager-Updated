import React, { useEffect, useRef } from 'react'
import { ToastAction, type ToastActionElement } from '@/components/ui/toast'
import { toast } from '@/components/ui/use-toast'
import { getElectronBridge } from '@/lib/electronBridge'

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const decimals = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(decimals)} ${units[unitIndex]}`
}

export function useAutoUpdate() {
  const toastRef = useRef<ReturnType<typeof toast> | null>(null)
  const isDownloadingRef = useRef(false)

  useEffect(() => {
    const electron = getElectronBridge()

    const showUpdateErrorToast = (message: string) => {
      isDownloadingRef.current = false
      toastRef.current?.dismiss()
      toastRef.current = toast({
        title: 'Update failed',
        description: message,
        variant: 'destructive',
        duration: Infinity
      })
    }

    const removeAvailable = electron.onUpdateAvailable((info) => {
      isDownloadingRef.current = false
      toastRef.current?.dismiss()
      toastRef.current = toast({
        title: `Update available: v${info.version}`,
        description: 'A new version is ready to download.',
        action: React.createElement(
          ToastAction,
          {
            altText: 'Download update',
            onClick: () => {
              void electron.downloadUpdate().catch((error) => {
                showUpdateErrorToast((error as Error).message || 'Failed to download the update.')
              })
            }
          },
          'Download'
        ) as unknown as ToastActionElement,
        duration: Infinity
      })
    })

    const removeProgress = electron.onDownloadProgress((progress) => {
      const percent = Math.max(0, Math.min(100, Math.round(progress.percent)))
      const description = progress.total > 0
        ? `${percent}% complete (${formatBytes(progress.transferred)} of ${formatBytes(progress.total)})`
        : `${percent}% complete`

      // First progress event: dismiss any prior toast (e.g. "Update available"
      // with a stale Download action) and create a fresh downloading toast.
      // Subsequent events: update in place to avoid animation/timer churn.
      if (!isDownloadingRef.current) {
        isDownloadingRef.current = true
        toastRef.current?.dismiss()
        toastRef.current = toast({
          title: 'Downloading update',
          description,
          duration: Infinity
        })
        return
      }

      toastRef.current?.update({
        id: toastRef.current.id,
        title: 'Downloading update',
        description,
        duration: Infinity,
        // Explicitly clear fields that could leak from a prior toast state
        // (the reducer shallow-merges, so undefined overwrites stale values)
        action: undefined,
        variant: undefined
      })
    })

    const removeDownloaded = electron.onUpdateDownloaded(() => {
      isDownloadingRef.current = false
      toastRef.current?.dismiss()
      toastRef.current = toast({
        title: 'Update ready to install',
        description: 'Restart now to apply the update.',
        action: React.createElement(
          ToastAction,
          {
            altText: 'Restart and update',
            onClick: () => {
              void electron.installUpdate().catch((error) => {
                showUpdateErrorToast((error as Error).message || 'Failed to install the update.')
              })
            }
          },
          'Restart'
        ) as unknown as ToastActionElement,
        duration: Infinity
      })
    })

    const removeError = electron.onUpdateError((message) => {
      showUpdateErrorToast(message || 'Unable to complete the update.')
    })

    // Subscriptions are in place before the first automatic check.
    void electron.checkForUpdates().catch((error) => {
      showUpdateErrorToast((error as Error).message || 'Failed to check for updates.')
    })

    return () => {
      removeAvailable()
      removeProgress()
      removeDownloaded()
      removeError()
      toastRef.current?.dismiss()
    }
  }, [])
}
