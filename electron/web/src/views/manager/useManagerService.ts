import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateAPIConfig } from '@/lib/api'
import { toast } from '@/components/ui/use-toast'

/**
 * Initializes the backend service for the given appId.
 * Returns `serviceReady` which gates data-fetching queries.
 */
export function useManagerService(appId: string | undefined, numericAppId: number) {
  const navigate = useNavigate()
  const [serviceReady, setServiceReady] = useState(false)

  // Guard against stale async completions when appId changes mid-flight
  const activeAppIdRef = useRef(numericAppId)

  useEffect(() => {
    // Reset ready state when switching apps so queries don't fire with stale config
    setServiceReady(false)
    activeAppIdRef.current = numericAppId

    if (!appId || isNaN(numericAppId)) {
      navigate('/')
      return
    }

    const ensureServiceInitialized = async () => {
      try {
        const bridge = window.electron
        if (!bridge?.startServiceForApp) {
          // Browser mode - no service restart needed
          if (activeAppIdRef.current === numericAppId) setServiceReady(true)
          return
        }

        // If service already running for this app, reuse current config
        const current = await bridge.getCurrentAppId?.()
        if (current && current.appId === numericAppId) {
          if (activeAppIdRef.current !== numericAppId) return
          updateAPIConfig({ baseUrl: current.baseUrl, token: current.token })
          setServiceReady(true)
          return
        }

        // Restart service to ensure clean state and correct forced mode
        const result = await bridge.startServiceForApp(numericAppId)

        // Stale check: if appId changed while we were awaiting, bail out
        if (activeAppIdRef.current !== numericAppId) return

        // CRITICAL: Update API config with new token before any data fetch
        updateAPIConfig({ baseUrl: result.baseUrl, token: result.token })

        // Signal that service is ready and queries can fire
        setServiceReady(true)
      } catch (err) {
        // If this init is stale, silently discard
        if (activeAppIdRef.current !== numericAppId) return

        const errorMessage = (err as Error).message || ''

        // If restart already in progress, fall back to getConfig to pick up current token
        if (errorMessage.includes('restart already in progress')) {
          console.warn('Service restart in progress, using current config')
          try {
            const bridge = window.electron
            if (bridge?.getConfig) {
              const config = await bridge.getConfig()
              if (activeAppIdRef.current !== numericAppId) return
              updateAPIConfig({ baseUrl: config.baseUrl, token: config.token })
              setServiceReady(true)
              return
            }
          } catch (fallbackErr) {
            console.error('Failed to get config:', fallbackErr)
          }
        }

        console.error('Failed to initialize service:', err)
        toast({
          title: 'Initialization Error',
          description: 'Failed to start service for this game',
          variant: 'destructive'
        })
        navigate('/')
      }
    }

    ensureServiceInitialized()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, numericAppId, navigate])

  return serviceReady
}
