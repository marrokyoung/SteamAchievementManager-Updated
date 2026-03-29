import { useEffect, useRef } from 'react'
import { toast } from '@/components/ui/use-toast'
import { ToastAction, type ToastActionElement } from '@/components/ui/toast'
import React from 'react'

export function useAutoUpdate() {
  const toastRef = useRef<{ dismiss: () => void } | null>(null)

  useEffect(() => {
    const electron = window.electron
    if (!electron?.onUpdateAvailable) return

    const removeAvailable = electron.onUpdateAvailable((info) => {
      toastRef.current?.dismiss()
      toastRef.current = toast({
        title: `Update available: v${info.version}`,
        description: 'A new version is ready to download.',
        action: React.createElement(
          ToastAction,
          {
            altText: 'Download update',
            onClick: () => { electron.downloadUpdate() }
          },
          'Download'
        ) as unknown as ToastActionElement,
        duration: Infinity
      })
    })

    const removeDownloaded = electron.onUpdateDownloaded(() => {
      toastRef.current?.dismiss()
      toastRef.current = toast({
        title: 'Update ready to install',
        description: 'Restart now to apply the update.',
        action: React.createElement(
          ToastAction,
          {
            altText: 'Restart and update',
            onClick: () => { electron.installUpdate() }
          },
          'Restart'
        ) as unknown as ToastActionElement,
        duration: Infinity
      })
    })

    // Subscriptions are in place — trigger the first check.
    electron.checkForUpdates()

    return () => {
      removeAvailable()
      removeDownloaded()
    }
  }, [])
}
