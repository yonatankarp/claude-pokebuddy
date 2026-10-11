import { POKEDEX } from './data/pokedex.generated'
import type { Species } from './data/types'
import { sfc32 } from './rng'

export const LEGENDARIES: ReadonlySet<number> = new Set([144, 145, 146, 150, 151])
export const PERSONALITIES = ['cheerful', 'grumpy', 'sleepy', 'brave', 'timid', 'sassy', 'curious', 'proud'] as const
export type Personality = (typeof PERSONALITIES)[number]
export type Roll = { species: number; isShiny: boolean; personality: Personality }

export function rollWeight(s: Species): number {
  if (s.evolvesFrom !== null) return 0
  if (LEGENDARIES.has(s.id)) return 0.02
  return s.evolutions.length === 0 ? 0.33 : 1
}

export function rollFrom(seed: readonly number[]): Roll {
  const rand = sfc32(seed)
  const total = POKEDEX.reduce((a, s) => a + rollWeight(s), 0)
  let pick = rand() * total
  let chosen = POKEDEX[0]!
  for (const s of POKEDEX) {
    const w = rollWeight(s)
    if (w === 0) continue
    chosen = s
    if (pick < w) break
    pick -= w
  }
  const isShiny = rand() < 1 / 512
  const personality = PERSONALITIES[Math.floor(rand() * PERSONALITIES.length)]!
  return { species: chosen.id, isShiny, personality }
}
