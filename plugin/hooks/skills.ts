import type { PokemonType, Species } from './data/types'
import type { Save } from './state'
import type { Source } from './tally'

/**
 * The active Pokémon's skills, each grown from the EXP of the work behind it; feeding grows none.
 * A skill speeds up its own work and draws wild Pokémon of its types.
 */
export const SKILLS: readonly { name: string; from: readonly Source[]; types: readonly PokemonType[] }[] = [
  { name: 'DEBUGGING', from: ['green'], types: ['bug', 'poison'] },
  { name: 'SHIPPING', from: ['commit', 'push'], types: ['water', 'flying'] },
  { name: 'HACKING', from: ['tool'], types: ['electric', 'ghost'] },
  { name: 'FOCUS', from: ['prompt', 'active'], types: ['psychic', 'fighting'] },
  { name: 'TINKERING', from: ['config'], types: ['fire', 'rock', 'ground'] },
  { name: 'WISDOM', from: ['judge'], types: ['dragon', 'grass'] },
]

/** Each skill 0 to 99: the square root of its EXP, so the first sessions show and the rest takes real work. */
export function skillStats(save: Pick<Save, 'expBySource'>) {
  return SKILLS.map(({ name, from, types }) => {
    const exp = from.reduce((n, src) => n + (save.expBySource[src] ?? 0), 0)
    return { name, value: Math.min(99, Math.floor(Math.sqrt(exp))), exp, from, types }
  })
}

/** Extra EXP, in percent, a skill gives its own work: half its value, so 99 is about +50%. */
export const expBonus = (value: number) => Math.floor(value / 2)

/** How much likelier a skill makes wild Pokémon of its types: +4% a point, so 99 is about five times. */
export const typePull = (value: number) => 1 + value / 25

/** EXP gained, each source raised by its skill's bonus. */
export function boosted(save: Pick<Save, 'expBySource'>, gained: Partial<Record<Source, number>>): Partial<Record<Source, number>> {
  const stats = skillStats(save)
  return Object.fromEntries(Object.entries(gained).map(([src, n]) => {
    const skill = stats.find(k => k.from.includes(src as Source))
    return [src, skill && typeof n === 'number' ? Math.round(n * (1 + expBonus(skill.value) / 100)) : n]
  }))
}

/** A wild roll's weight multiplier for a species: each skill that draws one of its types adds its pull. */
export function typeBias(save: Pick<Save, 'expBySource'>): (s: Species) => number {
  const stats = skillStats(save)
  return s => 1 + stats.filter(k => k.types.some(t => s.types.includes(t))).reduce((a, k) => a + typePull(k.value) - 1, 0)
}
