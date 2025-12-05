import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Gamepad2, RefreshCw, Loader2, Filter } from 'lucide-react'
import { useGames } from '@/hooks/useGameQueries'
import { updateAPIConfig, initializeAPI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import type { Game } from '@/types/api'

const GAME_TYPES = [
  { value: 'normal', label: 'Games', color: 'blue' },
  { value: 'demo', label: 'Demos', color: 'green' },
  { value: 'mod', label: 'Mods', color: 'purple' },
  { value: 'junk', label: 'Junk', color: 'gray' }
] as const

const normalizeGameType = (type: string) => {
  if (type === 'game' || type === 'normal') return 'normal'
  if (type === 'demo') return 'demo'
  if (type === 'mod') return 'mod'
  if (type === 'junk') return 'junk'
  // Default unknown types to 'normal' for safety
  return 'normal'
}

// Helper to resolve full image URLs (relative API URLs need baseUrl prepended)
const getFullImageUrl = async (imageUrl: string | null): Promise<string | null> => {
  if (!imageUrl) return null

  // If it's already a full URL (CDN), return as-is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl
  }

  // If it's a relative API URL, prepend baseUrl
  if (imageUrl.startsWith('/api/')) {
    try {
      const config = await initializeAPI()
      return `${config.baseUrl}${imageUrl}`
    } catch {
      return null
    }
  }

  return imageUrl
}

export default function PickerView() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  // Load filter state from localStorage, default to 'normal' (Games) on first load
  const [showAllTypes, setShowAllTypes] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('sam-showAllTypes')
      return saved ? JSON.parse(saved) : false
    }
    return false
  })

  const [activeFilters, setActiveFilters] = useState<Set<string>>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('sam-activeFilters')
      if (saved) {
        return new Set(JSON.parse(saved))
      }
    }
    return new Set(['normal']) // Default: Games selected on first load
  })

  const [previousFilters, setPreviousFilters] = useState<Set<string>>(new Set())
  const [isRestartingService, setIsRestartingService] = useState(false)

  // Persist filter state to localStorage
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sam-showAllTypes', JSON.stringify(showAllTypes))
      localStorage.setItem('sam-activeFilters', JSON.stringify(Array.from(activeFilters)))
    }
  }, [showAllTypes, activeFilters])

  const { data: games, isLoading, error, refetch } = useGames(false, false)

  const handleGameSelect = async (appId: number) => {
    if (isRestartingService) return // Prevent double-clicks

    setIsRestartingService(true)
    try {
      const bridge = window.electron
      if (!bridge?.startServiceForApp) {
        throw new Error('Electron bridge not available')
      }

      // Restart service with forced AppId
      const result = await bridge.startServiceForApp(appId)

      // CRITICAL: Update API config with new token BEFORE navigation
      updateAPIConfig({ baseUrl: result.baseUrl, token: result.token })

      // Navigate to manager (service already initialized)
      navigate(`/manager/${appId}`)
    } catch (err) {
      console.error('Failed to start service for app:', err)
      toast({
        title: 'Failed to initialize game',
        description: (err as Error).message || 'Could not restart service',
        variant: 'destructive'
      })
    } finally {
      setIsRestartingService(false)
    }
  }

  const filteredGames = games?.filter(game => {
    const matchesSearch = game.name.toLowerCase().includes(searchQuery.toLowerCase())
    const gameType = normalizeGameType(game.type)
    const matchesType = activeFilters.size === 0 || activeFilters.has(gameType)
    return matchesSearch && matchesType
  }) || []

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load games</p>
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container relative mx-auto max-w-7xl p-6 md:p-10">
      {/* Header */}
      <div className="mb-6 space-y-2">
        <span className="text-xs uppercase tracking-[0.2em] text-primary/80">
          Library
        </span>
        <h2 className="text-3xl font-bold text-white">
          Select a Game
        </h2>
        <p className="text-sm text-muted-foreground/80">
          Search your Steam catalog, filter by type, and jump straight into managing achievements.
        </p>
      </div>

      {/* Search and filter controls */}
      <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/70" />
            <Input
              type="text"
              placeholder="Search games..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant={activeFilters.size > 0 && !showAllTypes ? 'default' : 'outline'}
                size="sm"
                className="min-w-[140px]"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filter Types
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="mt-1">
              {/* Individual game type filters */}
              {GAME_TYPES.map(type => (
                <DropdownMenuCheckboxItem
                  key={type.value}
                  checked={activeFilters.has(type.value)}
                  disabled={showAllTypes}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(checked) => {
                    const next = new Set(activeFilters)
                    if (checked) next.add(type.value)
                    else next.delete(type.value)
                    setActiveFilters(next)
                  }}
                >
                  {type.label}
                </DropdownMenuCheckboxItem>
              ))}

              {/* Separator */}
              <DropdownMenuSeparator />

              {/* "All Types" toggle */}
              <DropdownMenuCheckboxItem
                checked={showAllTypes}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) => {
                  if (checked) {
                    // Turning ON: save current filters and show all types
                    setPreviousFilters(new Set(activeFilters))
                    setActiveFilters(new Set()) // Empty set = show all
                  } else {
                    // Turning OFF: restore previous filter selection
                    setActiveFilters(new Set(previousFilters))
                  }
                  setShowAllTypes(checked)
                }}
              >
                All Types
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => refetch()} 
            title="Refresh games"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Results count */}
        {!isLoading && (
          <p className="text-xs text-muted-foreground/80 mt-3">
            Showing {filteredGames.length} of {games?.length || 0} games
          </p>
        )}
      </div>

      {/* Game grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="h-44 rounded-xl border border-white/10 bg-white/5 shadow-[0_15px_45px_rgba(0,0,0,0.45)] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          {filteredGames.map(game => (
            <GameCard
              key={game.id}
              game={game}
              onClick={handleGameSelect}
              isInitializing={isRestartingService}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredGames.length === 0 && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-12 text-center shadow-[0_18px_55px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <Gamepad2 className="h-16 w-16 text-muted-foreground/70 mx-auto mb-4" />
          <p className="text-lg font-semibold text-white mb-2">No games found</p>
          <p className="text-sm text-muted-foreground/80">
            Try adjusting your search or filters
          </p>
        </div>
      )}
    </div>
  )
}

// Game card component
function GameCard({
  game,
  onClick,
  isInitializing
}: {
  game: Game
  onClick: (appId: number) => void
  isInitializing: boolean
}) {
  const [imageError, setImageError] = useState(false)
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null)
  const normalizedType = normalizeGameType(game.type)
  const typeConfig = GAME_TYPES.find(t => t.value === normalizedType)

  // Reset error state and resolve full URL when game changes
  useEffect(() => {
    setImageError(false)
    setFullImageUrl(null) // Clear previous URL immediately

    let isActive = true // Flag to prevent stale updates

    // Resolve full image URL (prepend baseUrl for relative API URLs)
    getFullImageUrl(game.imageUrl).then(url => {
      if (isActive) {
        setFullImageUrl(url)
      }
    })

    // Cleanup: mark as inactive to prevent setting stale URLs
    return () => {
      isActive = false
    }
  }, [game.id, game.imageUrl])

  return (
    <button
      onClick={() => onClick(game.id)}
      disabled={isInitializing}
      className={cn(
        'group relative aspect-[460/215] overflow-hidden rounded-xl border transition-all duration-200',
        'bg-white/5 border-white/10 shadow-[0_15px_45px_rgba(0,0,0,0.45)] hover:-translate-y-1',
        'hover:shadow-[0_20px_55px_rgba(124,58,237,0.35)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(140,97,255,0.65)] focus-visible:ring-offset-0',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        game.owned
          ? 'border-primary/35 hover:border-primary/70'
          : 'border-yellow-400/40 hover:border-yellow-400/70'
      )}
    >
      {/* Image or placeholder */}
      <div className="relative w-full h-full">
        {fullImageUrl && !imageError ? (
          <img
            src={fullImageUrl}
            alt={game.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-gradient-to-br from-[#221239] via-[#140d26] to-[#0c0818]">
            <Gamepad2 className="h-16 w-16 text-muted-foreground/40" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />
      </div>

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-sm font-semibold text-white line-clamp-2 mb-1">{game.name}</p>

        <div className="flex items-center gap-2">
          {!game.owned && (
            <span className="text-xs bg-yellow-400/90 text-yellow-950 px-2 py-0.5 rounded-full font-semibold shadow-sm">
              Not Owned
            </span>
          )}

          {typeConfig && (
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full font-semibold border border-white/10 bg-white/10 text-white shadow-sm',
                normalizedType === 'demo' && 'bg-emerald-400/30 text-emerald-100 border-emerald-200/40',
                normalizedType === 'mod' && 'bg-purple-500/30 text-purple-100 border-purple-200/40',
                normalizedType === 'junk' && 'bg-slate-500/30 text-slate-100 border-slate-200/30',
                normalizedType === 'normal' && 'bg-blue-500/30 text-blue-100 border-blue-200/40'
              )}
            >
              {typeConfig.label}
            </span>
          )}
        </div>
      </div>

      {/* Loading indicator when initializing */}
      {isInitializing && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        </div>
      )}
    </button>
  )
}
