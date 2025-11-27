import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Gamepad2 } from 'lucide-react'
import { useGames, useInitGame } from '@/hooks/useGameQueries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function PickerView() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [showUnowned, setShowUnowned] = useState(false)

  const { data: games, isLoading, error } = useGames(showUnowned, false)
  const initGame = useInitGame()

  const handleGameSelect = async (appId: number) => {
    try {
      await initGame.mutateAsync(appId)
      navigate(`/manager/${appId}`)
    } catch (err) {
      console.error('Failed to initialize game:', err)
    }
  }

  const filteredGames = games?.filter(game =>
    game.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

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
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Select a Game</h2>

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
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filteredGames.map(game => (
            <button
              key={game.id}
              onClick={() => handleGameSelect(game.id)}
              disabled={initGame.isPending}
              className="group relative h-32 overflow-hidden rounded-lg border bg-card hover:bg-accent transition-colors disabled:opacity-50"
            >
              {game.imageUrl ? (
                <img
                  src={game.imageUrl}
                  alt={game.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <Gamepad2 className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2">
                <p className="text-xs font-medium text-white truncate">
                  {game.name}
                </p>
                {!game.owned && (
                  <p className="text-xs text-yellow-400">Not Owned</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {!isLoading && filteredGames.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No games found</p>
        </div>
      )}
    </div>
  )
}
