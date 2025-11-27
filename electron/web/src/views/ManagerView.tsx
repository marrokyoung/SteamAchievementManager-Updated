import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGameData, useInitGame } from '@/hooks/useGameQueries'
import { Button } from '@/components/ui/button'

export default function ManagerView() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()
  const initGame = useInitGame()

  // Guard against missing or invalid appId
  const numericAppId = appId ? Number(appId) : NaN

  useEffect(() => {
    if (!appId || isNaN(numericAppId)) {
      navigate('/')
      return
    }

    // Initialize the game when the view loads and handle errors
    initGame.mutateAsync(numericAppId).catch((err) => {
      console.error('Failed to initialize game:', err)
      // Could add error toast here in the future
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, numericAppId, navigate])

  const { data: gameData, isLoading, error } = useGameData(numericAppId)

  // Show init errors
  if (initGame.isError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to initialize game</p>
          <p className="text-sm text-muted-foreground">
            {(initGame.error as Error)?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Return to game selection
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load game data</p>
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading game data...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">{gameData?.gameName}</h2>
        <div className="flex gap-2">
          <Button>Save Changes</Button>
          <Button variant="outline">Reset Stats</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Achievements Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4">
            Achievements ({gameData?.achievements.length || 0})
          </h3>
          <div className="space-y-2">
            {gameData?.achievements.map(achievement => (
              <div key={achievement.id} className="p-4 border rounded-lg">
                <p className="font-medium">{achievement.name}</p>
                <p className="text-sm text-muted-foreground">{achievement.description}</p>
                <p className="text-xs mt-2">
                  {achievement.isAchieved ? 'Unlocked' : 'Locked'}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Stats Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4">
            Stats ({gameData?.stats.length || 0})
          </h3>
          <div className="space-y-2">
            {gameData?.stats.map(stat => (
              <div key={stat.id} className="p-4 border rounded-lg">
                <p className="font-medium">{stat.displayName}</p>
                <p className="text-sm text-muted-foreground">
                  Value: {stat.value} ({stat.type})
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
