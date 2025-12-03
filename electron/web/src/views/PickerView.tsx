import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Gamepad2, RefreshCw, Loader2 } from 'lucide-react'
import { useGames } from '@/hooks/useGameQueries'
import { updateAPIConfig } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import type { Game } from '@/types/api'

const GAME_TYPES = [
  { value: 'game', label: 'Normal', color: 'blue' },
  { value: 'demo', label: 'Demo', color: 'green' },
  { value: 'mod', label: 'Mod', color: 'purple' },
  { value: 'junk', label: 'Junk', color: 'gray' }
] as const

export default function PickerView() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [showUnowned, setShowUnowned] = useState(false)
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(['game', 'demo', 'mod', 'junk'])
  )
  const [isRestartingService, setIsRestartingService] = useState(false)

  const { data: games, isLoading, error, refetch } = useGames(showUnowned, false)

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

  const toggleFilter = (type: string) => {
    const next = new Set(activeFilters)
    if (next.has(type)) {
      next.delete(type)
    } else {
      next.add(type)
    }
    setActiveFilters(next)
  }

  const filteredGames = games?.filter(game => {
    const matchesSearch = game.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = activeFilters.size === 0 || activeFilters.has(game.type)
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
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Select a Game</h2>

        {/* Search and ownership filter */}
        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search games..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            variant={showUnowned ? 'default' : 'outline'}
            onClick={() => setShowUnowned(!showUnowned)}
          >
            {showUnowned ? 'Show Owned Only' : 'Show All Games'}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Type filters */}
        <div className="flex gap-2">
          {GAME_TYPES.map(type => (
            <Button
              key={type.value}
              variant={activeFilters.has(type.value) ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleFilter(type.value)}
            >
              {type.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {!isLoading && (
        <p className="text-sm text-muted-foreground mb-4">
          Showing {filteredGames.length} of {games?.length || 0} games
        </p>
      )}

      {/* Game grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(15)].map((_, i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
        <div className="text-center py-12">
          <Gamepad2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium text-muted-foreground mb-2">No games found</p>
          <p className="text-sm text-muted-foreground">
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
  const typeConfig = GAME_TYPES.find(t => t.value === game.type)

  return (
    <button
      onClick={() => onClick(game.id)}
      disabled={isInitializing}
      className={cn(
        'group relative h-40 overflow-hidden rounded-lg border-2 transition-all',
        'hover:scale-105 hover:shadow-xl',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        game.owned
          ? 'border-primary/50 bg-card hover:border-primary'
          : 'border-muted bg-muted/50 hover:border-yellow-500'
      )}
    >
      {/* Image or placeholder */}
      <div className="relative w-full h-full">
        {game.imageUrl ? (
          <img
            src={game.imageUrl}
            alt={game.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-110"
            onError={(e) => {
              // Fallback to placeholder on image load error
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-gradient-to-br from-muted to-muted/50">
            <Gamepad2 className="h-16 w-16 text-muted-foreground/30" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
      </div>

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-sm font-semibold text-white line-clamp-2 mb-1">{game.name}</p>

        <div className="flex items-center gap-2">
          {!game.owned && (
            <span className="text-xs bg-yellow-500 text-yellow-950 px-2 py-0.5 rounded font-medium">
              Not Owned
            </span>
          )}

          {typeConfig && (
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded font-medium',
                game.type === 'demo' && 'bg-green-500/80 text-white',
                game.type === 'mod' && 'bg-purple-500/80 text-white',
                game.type === 'junk' && 'bg-gray-500/80 text-white',
                game.type === 'game' && 'bg-blue-500/80 text-white'
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
