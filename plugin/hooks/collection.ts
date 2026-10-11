import { species } from './data/dex'
import { expForLevel } from './exp'
import type { GameEvent } from './game'
import { rollFrom } from './roll'
import { START_LEVEL, type Mon, type Save } from './state'

/** Wild Pokémon a day, so a long session does not flood the box. */
export const ENCOUNTERS_PER_DAY = 3
/**
 * The chance of a wild Pokémon for each fixed check, each commit, a turn of tool work and a session the
 * judge scores JUDGE_ENCOUNTER or more: random, so a catch surprises, about 1 in 5 checks and 1 in 10 commits.
 */
export const ENCOUNTER_CHANCE = { green: 0.2, commit: 0.1, turn: 0.03, judge: 0.5 } as const
export const JUDGE_ENCOUNTER = 80

/** Wild Pokémon a turn's work turns up: each fixed check, each commit and the turn itself is a roll. */
export function encountersRolled(work: { greens: number; commits: number; usedTools: boolean }, rand: () => number): number {
  const rolls = [
    ...Array<number>(work.greens).fill(ENCOUNTER_CHANCE.green),
    ...Array<number>(work.commits).fill(ENCOUNTER_CHANCE.commit),
    ...(work.usedTools ? [ENCOUNTER_CHANCE.turn] : []),
  ]
  return rolls.filter(chance => rand() < chance).length
}

/**
 * Up to `n` wild Pokémon, caught at once and boxed at the start level, within the day's cap. `seed` gives
 * each its roll; `isLucky` (a feed streak) gives it a second chance at being shiny.
 */
export function catchWild(save: Save, n: number, seed: () => number[], date: string, isLucky = false): { save: Save; events: GameEvent[] } {
  const met = save.encounters.date === date ? save.encounters.count : 0
  const room = Math.max(0, Math.min(n, ENCOUNTERS_PER_DAY - met))
  if (room === 0) return { save, events: [] }
  const caught: Mon[] = []
  for (let i = 0; i < room; i++) {
    const roll = rollFrom(seed())
    const isShiny = roll.isShiny || (isLucky && rollFrom(seed()).isShiny)
    const level = START_LEVEL
    caught.push({ species: roll.species, isShiny, personality: roll.personality, nickname: null, level, exp: expForLevel(species(roll.species).growth, level) })
  }
  return {
    save: {
      ...save,
      box: [...save.box, ...caught],
      caught: [...new Set([...save.caught, ...caught.map(m => m.species)])].sort((a, b) => a - b),
      encounters: { date, count: met + room },
    },
    events: caught.map(m => ({ kind: 'caught' as const, species: m.species, isShiny: m.isShiny })),
  }
}

/** The active Pokémon as the box keeps it. */
function boxed(save: Save): Mon {
  return { species: save.species, isShiny: save.isShiny, personality: save.personality, nickname: save.nickname, level: save.level, exp: save.exp }
}

/** The box entry `query` names: its number (1-based) or a nickname or species name, any case. */
export function findInBox(save: Save, query: string): number | null {
  const q = query.trim().toLowerCase()
  if (/^\d+$/.test(q)) {
    const i = Number(q) - 1
    return i >= 0 && i < save.box.length ? i : null
  }
  const i = save.box.findIndex(m => m.nickname?.toLowerCase() === q || species(m.species).name.toLowerCase() === q)
  return i === -1 ? null : i
}

/** Makes box entry `index` the active Pokémon; the active one takes its place in the box. */
export function switchTo(save: Save, index: number): { save: Save; error?: string } {
  const next = save.box[index]
  if (!next) return { save, error: 'There is no Pokémon at that place in the box.' }
  // An evolution belongs to the Pokémon on screen: it finishes or is stopped first.
  if (save.evolution) return { save, error: `${species(save.species).name} is evolving. Wait for it, or /buddy stop first.` }
  const box = [...save.box]
  box[index] = boxed(save)
  return { save: { ...save, ...next, box, evolution: null, cancelledAtLevel: null } }
}

/** Lets box entry `index` go. The active Pokémon is never in the box, so the last one always stays. */
export function release(save: Save, index: number): { save: Save; released?: Mon } {
  const m = save.box[index]
  if (!m) return { save }
  return { save: { ...save, box: save.box.filter((_, i) => i !== index) }, released: m }
}
