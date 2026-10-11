import type { Evolution, Stone } from '../hooks/data/types.ts'

type Detail = { trigger: { name: string }; min_level?: number | null; item?: { name: string } | null }
export type ChainLink = { species: { url: string }; evolution_details: Detail[]; evolves_to: ChainLink[] }

const STONE_NAMES = new Set(['moon-stone', 'fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone'])

export const idFromUrl = (url: string): number => Number(url.split('/').filter(Boolean).pop())

function find(link: ChainLink, id: number): ChainLink | null {
  if (idFromUrl(link.species.url) === id) return link
  for (const next of link.evolves_to) {
    const hit = find(next, id)
    if (hit) return hit
  }
  return null
}

export function evolutionsFrom(chain: ChainLink, id: number): Evolution[] {
  const link = find(chain, id)
  if (!link) return []
  const out: Evolution[] = []
  for (const next of link.evolves_to) {
    const to = idFromUrl(next.species.url)
    if (to > 151) continue
    for (const d of next.evolution_details) {
      if (d.trigger.name === 'level-up' && typeof d.min_level === 'number') out.push({ kind: 'level', to, level: d.min_level })
      else if (d.trigger.name === 'use-item' && d.item && STONE_NAMES.has(d.item.name)) out.push({ kind: 'stone', to, stone: d.item.name as Stone })
      else if (d.trigger.name === 'trade' && !d.item) out.push({ kind: 'trade', to })
      else continue
      break
    }
  }
  return out
}

export function evolvesFromId(url: string | null): number | null {
  if (!url) return null
  const id = idFromUrl(url)
  return id > 151 ? null : id
}
