import { species } from './data/dex'
import { STONES, type Species, type Stone } from './data/types'
import { TRADE_LEVEL } from './evolution'
import { expForLevel, MAX_LEVEL } from './exp'
import { previousDate } from './localtime'
import type { Save } from './state'
import type { Source } from './tally'

const SUBS = ['stats', 'dex', 'feed', 'use', 'stop', 'toggle', 'quiet', 'nickname', 'export', 'import', 'restore', 'reset'] as const
export type Parsed = { sub: (typeof SUBS)[number] | 'help'; rest: string }

export function parseArgs(args: string): Parsed {
  const trimmed = args.trim()
  if (!trimmed) return { sub: 'stats', rest: '' }
  const [head = '', ...tail] = trimmed.split(/\s+/)
  const rest = tail.join(' ')
  const sub = (SUBS as readonly string[]).includes(head.toLowerCase()) ? (head.toLowerCase() as Parsed['sub']) : 'help'
  return { sub, rest: sub === 'help' ? trimmed : rest }
}

export function parseStone(text: string): Stone | null {
  const key = text.trim().toLowerCase().replace(/\s+/g, '-').replace(/-stone$/, '') + '-stone'
  return (STONES as readonly string[]).includes(key) ? (key as Stone) : null
}

const stoneName = (s: Stone) => s.replace('-', ' ').toUpperCase()
const SOURCE_NAMES: Record<Source, string> = {
  prompt: 'prompts', tool: 'tool calls', active: 'active time', config: 'config edits', commit: 'commits',
  push: 'pushes and PRs', green: 'green checks', judge: 'session judge', feed: 'feeding',
}

/** The feed streak as of `today`: a run whose last feed was before yesterday is already broken. */
export function feedStreak(save: Save, today: string): number {
  const last = save.feed.lastDate
  return last !== null && last >= previousDate(today) ? save.counters.feedRun : 0
}

export function statsText(save: Save, today: string): string {
  const sp = species(save.species)
  const toNext = save.level >= MAX_LEVEL ? 'max level' : `${expForLevel(sp.growth, save.level + 1) - save.exp} EXP to Lv ${save.level + 1}`
  const bag = STONES.filter(s => save.bag[s]).map(s => `${stoneName(s)} ×${save.bag[s]}`).join(', ') || 'empty'
  const sources = Object.entries(save.expBySource).filter(([k]) => k in SOURCE_NAMES).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k, n]) => `  ${SOURCE_NAMES[k as Source]}: ${n}`).join('\n') || '  nothing yet'
  const c = save.counters
  const streak = feedStreak(save, today)
  const hints = sp.evolutions.map(e =>
    e.kind === 'level' ? `Evolves into ${species(e.to).name} at Lv ${e.level}.`
    : e.kind === 'stone' ? `Evolves into ${species(e.to).name} with a ${stoneName(e.stone)}.`
    : `Evolves into ${species(e.to).name} when traded: push or open a PR at Lv ${TRADE_LEVEL} or higher.`)
  return [
    `${save.nickname ? `${save.nickname} (${sp.name})` : sp.name}${save.isShiny ? ' ★' : ''}  Lv ${save.level}  ${save.personality}`,
    `${toNext}. Lifetime EXP ${save.lifetimeExp}.`,
    'EXP by source:', sources,
    `Bag: ${bag}`,
    `Stone progress: Thunder Stone ${c.greens % 10}/10 green checks, Fire Stone ${c.commits % 10}/10 commits, Water Stone ${c.configEdits % 10}/10 config edits, Leaf Stone ${streak % 7}/7 feed days.`,
    `Feed streak: ${streak} day${streak === 1 ? '' : 's'}.`,
    ...(hints.length ? hints : ['Does not evolve.']),
  ].join('\n')
}

export function dexText(s: Species, owned: boolean): string {
  return [
    `#${String(s.id).padStart(3, '0')} ${s.name}${owned ? '  (yours)' : ''}`,
    `Type: ${s.types.join(' / ')}   Height: ${(s.height / 10).toFixed(1)} m   Weight: ${(s.weight / 10).toFixed(1)} kg`,
    s.dex,
  ].join('\n')
}

export function helpText(command: string): string {
  return [
    `/${command} stats: your Pokémon, EXP and progress`,
    `/${command} dex [name or number]: Pokédex entry`,
    `/${command} feed: a Rare Candy, once a day`,
    `/${command} use <stone>: evolve with a stone`,
    `/${command} stop: cancel an evolution in progress`,
    `/${command} toggle: compact or full view`,
    `/${command} quiet: speech and the session judge on or off`,
    `/${command} nickname <name>: set a nickname (empty to clear)`,
    `/${command} export: copy your save to the clipboard`,
    `/${command} import <blob>: restore a save`,
    `/${command} restore: swap the backup slot back in`,
    `/${command} reset: what a reset does; /${command} reset confirm rolls a new Pokémon, once a day (the current save goes to the backup slot)`,
  ].join('\n')
}
