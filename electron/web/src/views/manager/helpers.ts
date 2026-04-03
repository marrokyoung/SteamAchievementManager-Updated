import type { Stat } from '@/types/api'

/**
 * Build a CDN URL for a Steam achievement icon.
 * Returns `null` when no icon path is available.
 */
export function buildAchievementIconUrl(appId: number, iconPath: string | null): string | null {
  if (!iconPath) return null
  if (iconPath.startsWith('http')) return iconPath
  return `https://cdn.steamstatic.com/steamcommunity/public/images/apps/${appId}/${iconPath}`
}

/**
 * Check whether a stat only exposes a raw internal ID
 * (no human-readable display name from the game schema).
 */
export function isRawIdStat(stat: Pick<Stat, 'id' | 'displayName'>): boolean {
  const displayName = stat.displayName?.trim() || stat.id
  return displayName.toLowerCase() === stat.id.toLowerCase() || /^stat_\d+$/i.test(displayName)
}
