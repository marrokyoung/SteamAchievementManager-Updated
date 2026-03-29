import { useState, useCallback, useRef } from 'react'
import { useLocation, useNavigate, useMatch } from 'react-router-dom'
import { ChevronLeft, Loader2, Minus, Maximize2, X } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { toast } from './ui/use-toast'
import { updateAPIConfig } from '@/lib/api'
import { useUnsavedChanges } from '@/contexts/UnsavedChangesContext'
import { useAutoUpdate } from '@/hooks/useAutoUpdate'

export default function Layout({ children }: { children: React.ReactNode }) {
  useAutoUpdate()
  const location = useLocation()
  const navigate = useNavigate()
  const managerMatch = useMatch('/manager/:appId')
  const showBack = location.pathname !== '/'

  const { hasUnsavedChanges, setHasUnsavedChanges, isNavigatingBack, setIsNavigatingBack } = useUnsavedChanges()
  const isBackingOutRef = useRef(false)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)

  const performManagerBack = useCallback(async () => {
    if (isBackingOutRef.current) return
    isBackingOutRef.current = true

    setIsNavigatingBack(true)
    try {
      const bridge = window.electron
      if (!bridge?.restartServiceNeutral) {
        navigate('/')
        return
      }

      const result = await bridge.restartServiceNeutral()
      updateAPIConfig({ baseUrl: result.baseUrl, token: result.token })
      navigate('/')
    } catch (err) {
      console.error('Failed to restart service:', err)
      toast({
        title: 'Warning',
        description: 'Service restart failed. Navigating to picker anyway.',
        variant: 'destructive'
      })
      navigate('/')
    } finally {
      setIsNavigatingBack(false)
      isBackingOutRef.current = false
    }
  }, [navigate, setIsNavigatingBack])

  const handleBack = useCallback(() => {
    if (!managerMatch) {
      navigate(-1)
      return
    }

    if (hasUnsavedChanges) {
      setShowLeaveDialog(true)
      return
    }

    performManagerBack()
  }, [managerMatch, hasUnsavedChanges, navigate, performManagerBack])

  const handleLeaveConfirm = useCallback(() => {
    setShowLeaveDialog(false)
    setHasUnsavedChanges(false)
    performManagerBack()
  }, [setHasUnsavedChanges, performManagerBack])

  const handleMinimize = () => window.electron?.windowMinimize?.()
  const handleMaximize = () => window.electron?.windowMaximize?.()
  const handleClose = () => window.electron?.windowClose?.()

  return (
    <div className="relative h-screen flex flex-col text-foreground">
      {/* Soft overlay to amplify the global gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.04),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.03),transparent_32%)]" />

      {/* Custom Title Bar */}
      <div
        className="relative z-10 h-12 flex items-center justify-between px-4 border-b border-white/10 bg-black/30 backdrop-blur-lg shadow-[0_10px_30px_rgba(0,0,0,0.45)] select-none"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center gap-2">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-foreground"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              onClick={handleBack}
              disabled={isNavigatingBack}
              aria-label="Back"
            >
              {isNavigatingBack
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ChevronLeft className="h-4 w-4" />
              }
            </Button>
          )}
          <h1 className="text-sm font-semibold text-foreground/90">Steam Achievement Manager</h1>
        </div>

        {/* Window Controls */}
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-foreground/80 hover:text-foreground"
            onClick={handleMinimize}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-foreground/80 hover:text-foreground"
            onClick={handleMaximize}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-foreground/80 hover:text-destructive-foreground hover:bg-destructive/80"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Unsaved changes confirmation */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="sam-glass-panel">
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have staged changes that haven't been saved to Steam. Leave anyway?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
              Stay
            </Button>
            <Button variant="destructive" onClick={handleLeaveConfirm}>
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Content */}
      <main className="relative z-10 flex-1 overflow-auto sam-scrollbar">
        {children}
      </main>
    </div>
  )
}
