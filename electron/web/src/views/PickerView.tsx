import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Search, Gamepad2, RefreshCw, Loader2, Filter } from 'lucide-react'
import { useGames } from '@/hooks/useGameQueries'
import { updateAPIConfig, initializeAPI, isSteamUnavailableError } from '@/lib/api'
import { getElectronBridge } from '@/lib/electronBridge'
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
  { value: 'normal', label: 'Games' },
  { value: 'demo', label: 'Demos' },
  { value: 'mod', label: 'Mods' },
  { value: 'junk', label: 'Junk' }
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
  const queryClient = useQueryClient()

  // Persist filter state to localStorage
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sam-showAllTypes', JSON.stringify(showAllTypes))
      localStorage.setItem('sam-activeFilters', JSON.stringify(Array.from(activeFilters)))
    }
  }, [showAllTypes, activeFilters])

  const [isRefreshing, setIsRefreshing] = useState(false)
  const { data: games, isLoading, isFetching, isFetched, error, refetch, forceRefresh, isRecovering, libraryReady } = useGames(false, !isRestartingService)
  const isWaitingForSteam = isSteamUnavailableError(error)

  const handleGameSelect = async (appId: number) => {
    if (isRestartingService) return // Prevent double-clicks

    setIsRestartingService(true)
    try {
      const bridge = getElectronBridge()

      // Stop library polling before switching the backend into forced-app mode.
      await queryClient.cancelQueries({ queryKey: ['games', false] })

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

  // Determine picker phase — only one branch renders at a time.
  // Previous approach kept all branches mounted with opacity toggles, but
  // hidden content still participated in layout, causing scrollbar flicker
  // when TanStack Query toggled isLoading during recovery polling.
  const isConnecting = isLoading && !isFetched
  const hasGames = !!games && games.length > 0
  // Only show the Steam-down overlay when we have no cached game data.
  // When returning from a game manager, the service restarts briefly —
  // suppress the overlay during that neutral window if we already have games.
  const showOverlay = isConnecting || ((isWaitingForSteam || isRecovering) && !hasGames)
  const showErrorCard = !showOverlay && !!error
  const showContent = !showOverlay && !showErrorCard

  // Derive overlay card text from stable values only.
  // `isWaitingForSteam` is derived from query.error which TanStack Query
  // temporarily clears during each refetch, so using it here would cause
  // the message to flip every poll tick. Instead, derive from `games`
  // (only set on successful response) which is stable across fetches.
  const overlayTitle = isConnecting
    ? 'Connecting to Steam...'
    : 'Waiting for Steam'

  const overlayMessage = isConnecting
    ? null
    : games && games.length > 0
      ? 'Steam detected, loading your library...'
      : 'Cannot connect to Steam. Please start Steam and try again.'

  return (
    <div className="relative h-full">
      {/* ── Overlay: waiting / connecting / recovering ────────────── */}
      {showOverlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center" role="status" aria-live="polite">
          <div className="max-w-md text-center space-y-4 rounded-2xl sam-glass-panel p-8">
            {isConnecting ? (
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            ) : (
              <div className="space-y-2">
                <p className="text-destructive text-lg font-semibold">{overlayTitle}</p>
                {overlayMessage && (
                  <p className="text-sm text-muted-foreground">{overlayMessage}</p>
                )}
                <p className="text-xs text-muted-foreground/80">
                  The library refreshes automatically once Steam opens.
                </p>
              </div>
            )}

            {/* Retry button — disabled with spinner when Steam is detected and loading */}
            {!isConnecting && (
              <Button
                variant="outline"
                disabled={isRefreshing || !!(games && games.length > 0)}
                onClick={async () => {
                  setIsRefreshing(true)
                  try {
                    await forceRefresh()
                  } catch {
                    await refetch()
                  } finally {
                    setIsRefreshing(false)
                  }
                }}
                className="min-w-[140px]"
              >
                {isRefreshing || (games && games.length > 0) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry now
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Error card (non-Steam errors) ─────────────────────────── */}
      {showErrorCard && (
        <div className="absolute inset-0 z-10 flex items-center justify-center" role="alert">
          <div className="max-w-md text-center space-y-4 rounded-2xl sam-glass-panel p-8">
            <div className="space-y-2">
              <p className="text-destructive text-lg font-semibold">Failed to load games</p>
              <p className="text-sm text-muted-foreground">{(error as Error)?.message}</p>
            </div>

            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="min-w-[140px]"
            >
              {isFetching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry now
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Main content: game grid ──────────────────────────────── */}
      {showContent && (
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
          <div className="mb-8 rounded-2xl sam-glass-panel p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
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
                    variant="default"
                    className="h-11 min-w-[140px]"
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
                className="h-11 w-11"
                disabled={isRefreshing}
                onClick={async () => {
                  setIsRefreshing(true)
                  try {
                    await forceRefresh()
                  } catch (err) {
                    toast({
                      title: 'Refresh failed',
                      description: (err as Error).message,
                      variant: 'destructive'
                    })
                  } finally {
                    setIsRefreshing(false)
                  }
                }}
                title="Refresh games"
                aria-label="Refresh games"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            </div>

            {/* Results count */}
            {!isLoading && (
              <p className="text-xs text-muted-foreground/80 mt-3">
                Showing {filteredGames.length} of {games?.length || 0} games
              </p>
            )}
          </div>

          {/* Library still stabilizing — Steam may still be loading subscriptions */}
          {!libraryReady && games && games.length > 0 && (
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Steam is still loading your library. The list will update automatically.
            </div>
          )}

          {/* Game grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {[...Array(15)].map((_, i) => (
                <div
                  key={i}
                  className="h-44 rounded-xl sam-glass-panel animate-pulse"
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
            <div className="mt-6 rounded-2xl sam-glass-panel p-12 text-center">
              <Gamepad2 className="h-16 w-16 text-muted-foreground/70 mx-auto mb-4" />
              <p className="text-lg font-semibold text-white mb-2">No games found</p>
              <p className="text-sm text-muted-foreground/80">
                Try adjusting your search or filters
              </p>
            </div>
          )}
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
  const [imageLoaded, setImageLoaded] = useState(false)
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null)
  const [fallbackStep, setFallbackStep] = useState(0)
  const [isLogoFallback, setIsLogoFallback] = useState(false)
  const hasArt = !!currentImageUrl && !imageError

  // Track if component is mounted (for async safety in ALL async operations)
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // Client GET-based fallback chain for when initial image fails (splash art only)
  // Server redirects to header.jpg; if that fails, client tries these in order
  const cdnFallbacks = [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/library_hero.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/hero.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/capsule_616x353.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/capsule_231x87.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${game.id}/capsule_sm_120.jpg`,
    `/api/games/${game.id}/logo`
  ]
  const LOGO_FALLBACK_START_INDEX = cdnFallbacks.length - 1 // last entry is logo

  // Reset on game change - guard with per-effect cancellation token
  useEffect(() => {
    let isActive = true

    setImageError(false)
    setImageLoaded(false)
    setFallbackStep(0)
    setIsLogoFallback(false)
    setCurrentImageUrl(null)

    // Resolve full image URL (prepend baseUrl for relative API URLs)
    getFullImageUrl(game.imageUrl).then(url => {
      // Guard against setting state after unmount or game change
      if (!isActive) return

      if (url) {
        setCurrentImageUrl(url)
      } else {
        // Initial URL failed - start fallback chain at index 0
        setCurrentImageUrl(cdnFallbacks[0])
      }
    })

    return () => { isActive = false }
  }, [game.id, game.imageUrl])

  // Advance through fallbacks on error using local loop to avoid async state issues
  const handleImageError = async () => {
    let localIndex = fallbackStep

    while (localIndex < cdnFallbacks.length) {
      const nextUrl = cdnFallbacks[localIndex]
      localIndex++

      // Skip if same as current URL
      if (nextUrl === currentImageUrl) continue

      const isLogo = (localIndex - 1) >= LOGO_FALLBACK_START_INDEX

      // Resolve API URLs (relative paths)
      let resolvedUrl: string | null = nextUrl
      if (nextUrl.startsWith('/api/')) {
        resolvedUrl = await getFullImageUrl(nextUrl)
      }

      // Check mount status after async operation
      if (!isMountedRef.current) return

      // If resolution failed, try next in loop
      if (!resolvedUrl) continue

      // Found a valid URL - update state and exit
      setFallbackStep(localIndex)
      setIsLogoFallback(isLogo)
      setCurrentImageUrl(resolvedUrl)
      return
    }

    // Exhausted all fallbacks
    if (isMountedRef.current) {
      setFallbackStep(localIndex)
      setImageError(true)
    }
  }

  return (
    <button
      onClick={() => onClick(game.id)}
      disabled={isInitializing}
      className={cn(
        'group relative aspect-[460/215] overflow-hidden rounded-xl border border-transparent transition-all duration-200',
        'bg-white/5 shadow-[0_15px_45px_rgba(0,0,0,0.45)] hover:-translate-y-1',
        'hover:shadow-[var(--accent-hover-shadow)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus-ring)] focus-visible:ring-offset-0',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      {/* Image with placeholder behind - placeholder visible until image loads */}
      <div className="relative w-full h-full">
        {/* Placeholder always rendered behind */}
        <div className={cn(
          "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[var(--surface-row-from)] via-[var(--surface-row-via)] to-[var(--surface-row-to)] transition-opacity duration-300",
          imageLoaded && hasArt ? "opacity-0" : "opacity-100"
        )}>
          <Gamepad2 className="h-16 w-16 text-muted-foreground/40" />
        </div>

        {/* Image fades in when loaded */}
        {hasArt && (
          <img
            src={currentImageUrl || undefined}
            alt={game.name}
            loading="lazy"
            className={cn(
              "w-full h-full transition-all duration-300",
              (game.imageType === 'logo' || isLogoFallback)
                ? 'object-contain p-8'
                : 'object-cover group-hover:scale-110',
              imageLoaded ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setImageLoaded(true)}
            onError={handleImageError}
          />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent pointer-events-none" />
      </div>

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1">
        {/* Title: always visible until image loads, then hover-only */}
        <p className={cn(
          "text-sm font-semibold text-white line-clamp-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-opacity duration-200",
          imageLoaded && hasArt ? "opacity-0 group-hover:opacity-100" : "opacity-100"
        )}>
          {game.name}
        </p>

        {!game.owned && (
          <span className="text-xs bg-yellow-400/90 text-yellow-950 px-2 py-0.5 rounded-full font-semibold shadow-sm">
            Not Owned
          </span>
        )}
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