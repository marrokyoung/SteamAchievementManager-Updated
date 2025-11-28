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
    <div className="h-screen flex flex-col bg-background">
      {/* Custom Title Bar */}
      <div
        className="h-12 flex items-center justify-between px-4 border-b bg-card select-none"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center gap-2">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              onClick={() => navigate(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-sm font-semibold">Steam Achievement Manager</h1>
        </div>

        {/* Window Controls */}
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleMinimize}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleMaximize}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
