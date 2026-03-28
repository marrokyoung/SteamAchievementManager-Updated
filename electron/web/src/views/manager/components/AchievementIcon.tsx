import { useState, useEffect } from 'react'
import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildAchievementIconUrl } from '../helpers'

// Cache successfully loaded icon URLs so reordered lists don't flash placeholders.
const loadedAchievementIconUrls = new Set<string>()

/** Clear the icon URL cache (call when switching games). */
export function clearAchievementIconCache() {
  loadedAchievementIconUrls.clear()
}

export function AchievementIcon({
  appId,
  iconNormal,
  iconLocked,
  isUnlocked,
  name
}: {
  appId: number
  iconNormal: string | null
  iconLocked: string | null
  isUnlocked: boolean
  name: string
}) {
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [fallbackToLocked, setFallbackToLocked] = useState(false)

  // Prefer the normal icon for consistency; only fall back to locked if needed.
  const primaryIconPath = iconNormal || iconLocked
  const canFallbackToLocked = !isUnlocked && iconNormal && iconLocked
  const iconPath = canFallbackToLocked && fallbackToLocked ? iconLocked : primaryIconPath

  // Primary URL (without fallback) used to seed load state from cache.
  const primaryImageUrl = buildAchievementIconUrl(appId, primaryIconPath)
  const imageUrl = buildAchievementIconUrl(appId, iconPath)

  // Reset state when icon or unlock state changes
  useEffect(() => {
    setImageError(false)
    setFallbackToLocked(false)
    setImageLoaded(primaryImageUrl ? loadedAchievementIconUrls.has(primaryImageUrl) : false)
  }, [primaryImageUrl, isUnlocked])

  // If fallback URL is already cached, show it immediately.
  useEffect(() => {
    if (imageUrl && loadedAchievementIconUrls.has(imageUrl)) {
      setImageLoaded(true)
    }
  }, [imageUrl])

  // No icon available - show placeholder
  if (!imageUrl || imageError) {
    return (
      <div className="w-12 h-12 rounded-lg bg-transparent flex items-center justify-center flex-shrink-0">
        <Trophy className="w-6 h-6 text-muted-foreground/40" />
      </div>
    )
  }

  return (
    <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-transparent">
      {/* Placeholder visible until loaded */}
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Trophy className="w-6 h-6 text-muted-foreground/40" />
        </div>
      )}

      <img
        src={imageUrl}
        alt={`${name} icon`}
        loading="lazy"
        className={cn(
          'w-full h-full object-cover transition-opacity duration-200',
          imageLoaded ? 'opacity-100' : 'opacity-0',
          // Desaturate locked achievements slightly
          !isUnlocked && 'grayscale-[30%] opacity-70'
        )}
        onLoad={(e) => {
          loadedAchievementIconUrls.add(e.currentTarget.currentSrc || e.currentTarget.src)
          setImageLoaded(true)
        }}
        onError={() => {
          if (canFallbackToLocked && !fallbackToLocked) {
            setFallbackToLocked(true)
            setImageLoaded(false)
            return
          }
          setImageError(true)
        }}
      />
    </div>
  )
}
