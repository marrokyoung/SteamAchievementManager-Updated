export interface Game {
  id: number
  name: string
  type: string
  imageUrl: string | null
  owned: boolean
}

export interface Achievement {
  id: string
  name: string
  description: string
  isAchieved: boolean
  unlockTime: string | null
  iconNormal: string | null
  iconLocked: string | null
  isHidden: boolean
  isProtected: boolean
}

export interface Stat {
  id: string
  displayName: string
  type: 'int' | 'float'
  value: number
  minValue: number
  maxValue: number
  incrementOnly: boolean
  isProtected: boolean
}

export interface GameData {
  appId: number
  gameName: string
  achievements: Achievement[]
  stats: Stat[]
}

export interface InitResponse {
  appId: number
  gameName: string
  status: string
}

export interface AchievementUpdate {
  id: string
  unlocked: boolean
}

export interface StatUpdate {
  id: string
  value: number
}
