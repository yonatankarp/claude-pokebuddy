import { POKEDEX } from './pokedex.generated'
import type { Species } from './types'

export function species(id: number): Species {
  const s = POKEDEX[id - 1]
  if (!s) throw new Error(`no species #${id}`)
  return s
}

export function findSpecies(query: string): Species | undefined {
  const q = query.trim().replace(/^#/, '')
  if (/^\d+$/.test(q)) return POKEDEX[Number(q) - 1]
  const name = q.toUpperCase()
  return POKEDEX.find(s => s.name === name)
}
