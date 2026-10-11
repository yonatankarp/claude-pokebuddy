import type { Growth } from './data/types'

export const MAX_LEVEL = 100

export function expForLevel(growth: Growth, level: number): number {
  if (level <= 1) return 0
  const n = level
  switch (growth) {
    case 'fast': return Math.floor((4 * n ** 3) / 5)
    case 'medium-fast': return n ** 3
    case 'medium-slow': return Math.max(0, Math.floor((6 * n ** 3) / 5 - 15 * n ** 2 + 100 * n - 140))
    case 'slow': return Math.floor((5 * n ** 3) / 4)
  }
}

export function levelForExp(growth: Growth, exp: number): number {
  let level = 1
  while (level < MAX_LEVEL && expForLevel(growth, level + 1) <= exp) level++
  return level
}
