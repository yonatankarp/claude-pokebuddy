import { ANIMATIONS } from './animation.generated'
import { POKEDEX as DATA } from './pokedex.generated'
import type { Species } from './types'

export const POKEDEX: readonly Species[] = DATA.map((s, i) => ({ ...s, ...ANIMATIONS[i]! }))

export function species(id: number): Species {
  const s = POKEDEX[id - 1]
  if (!s) throw new Error(`no species #${id}`)
  return s
}

/** Lower case, the gender signs as a trailing f or m, apostrophes, dots, spaces and hyphens dropped. */
const loose = (name: string) => name.toLowerCase().replace(/♀/g, 'f').replace(/♂/g, 'm').replace(/['’. -]/g, '')

export function findSpecies(query: string): Species | undefined {
  const q = query.trim().replace(/^#/, '')
  if (/^\d+$/.test(q)) return POKEDEX[Number(q) - 1]
  const name = loose(q)
  return POKEDEX.find(s => loose(s.name) === name)
}
