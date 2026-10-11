import { species } from './data/dex'
import type { Stone } from './data/types'

export const TRADE_LEVEL = 36
export type Counters = { greens: number; commits: number; configEdits: number; feedRun: number }

const EVERY: [keyof Counters, number, Stone][] = [
  ['greens', 10, 'thunder-stone'],
  ['commits', 10, 'fire-stone'],
  ['configEdits', 10, 'water-stone'],
  ['feedRun', 7, 'leaf-stone'],
]

export function stonesEarned(before: Counters, after: Counters): Stone[] {
  const out: Stone[] = []
  for (const [key, n, stone] of EVERY) {
    const earned = Math.floor(after[key] / n) - Math.floor(before[key] / n)
    for (let i = 0; i < earned; i++) out.push(stone)
  }
  return out
}

export function levelEvolution(id: number, level: number, cancelledAtLevel: number | null): number | null {
  if (cancelledAtLevel === level) return null
  const evo = species(id).evolutions.find(e => e.kind === 'level' && level >= e.level)
  return evo?.to ?? null
}

export function stoneEvolution(id: number, stone: Stone): number | null {
  const evo = species(id).evolutions.find(e => e.kind === 'stone' && e.stone === stone)
  return evo?.to ?? null
}

export function tradeEvolution(id: number, level: number): number | null {
  if (level < TRADE_LEVEL) return null
  return species(id).evolutions.find(e => e.kind === 'trade')?.to ?? null
}
