import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, Minus, Maximize2, X } from 'lucide-react'
import { Button } from './ui/button'

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const showBack = location.pathname !== '/'

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
              onClick={() => navigate(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
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

      {/* Main Content */}
      <main className="relative z-10 flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
