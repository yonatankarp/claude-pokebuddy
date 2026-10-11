import { COMMAND } from './config'
import { findSpecies, species } from './data/dex'
import { STONES, stoneName, type Species, type Stone } from './data/types'
import { TRADE_LEVEL } from './evolution'
import { expForLevel, MAX_LEVEL } from './exp'
import { cancelEvolution, feed, useStone, type GameEvent } from './game'
import { localTime, previousDate } from './localtime'
import { exportBlob, freshSave, importBlob, NICKNAME_MAX, parseSave, type Save } from './state'
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

const SOURCE_NAMES: Record<Source, string> = {
  prompt: 'prompts', tool: 'tool calls', active: 'active time', config: 'config edits', commit: 'commits',
  push: 'pushes and PRs', green: 'green checks', judge: 'session judge', feed: 'feeding',
}

/** The buddy's skills, each grown from the EXP of the work behind it; feeding grows none. */
const SKILLS: readonly { name: string; from: readonly Source[] }[] = [
  { name: 'DEBUGGING', from: ['green'] },
  { name: 'SHIPPING', from: ['commit', 'push'] },
  { name: 'HACKING', from: ['tool'] },
  { name: 'FOCUS', from: ['prompt', 'active'] },
  { name: 'TINKERING', from: ['config'] },
  { name: 'WISDOM', from: ['judge'] },
]

/** Each skill 0 to 99: the square root of its EXP, so the first sessions show and the rest takes real work. */
export function skillStats(save: Save): { name: string; value: number; exp: number; from: readonly Source[] }[] {
  return SKILLS.map(({ name, from }) => {
    const exp = from.reduce((n, src) => n + (save.expBySource[src] ?? 0), 0)
    return { name, value: Math.min(99, Math.floor(Math.sqrt(exp))), exp, from }
  })
}

/** The feed streak as of `today`: a run whose last feed was before yesterday is already broken. */
function feedStreak(save: Save, today: string): number {
  const last = save.feed.lastDate
  return last !== null && last >= previousDate(today) ? save.counters.feedRun : 0
}

export function statsText(save: Save, today: string): string {
  const sp = species(save.species)
  const toNext = save.level >= MAX_LEVEL ? 'max level' : `${expForLevel(sp.growth, save.level + 1) - save.exp} EXP to Lv ${save.level + 1}`
  const bag = STONES.filter(s => save.bag[s]).map(s => `${stoneName(s)} ×${save.bag[s]}`).join(', ') || 'empty'
  const skills = skillStats(save).map(k =>
    `  ${k.name.padEnd(9)} ${String(k.value).padStart(2)}  ${k.exp} EXP from ${k.from.map(src => SOURCE_NAMES[src]).join(', ')}`)
  const fed = save.expBySource.feed ?? 0
  const c = save.counters
  const streak = feedStreak(save, today)
  const hints = sp.evolutions.map(e =>
    e.kind === 'level' ? `Evolves into ${species(e.to).name} at Lv ${e.level}.`
    : e.kind === 'stone' ? `Evolves into ${species(e.to).name} with a ${stoneName(e.stone)}.`
    : `Evolves into ${species(e.to).name} when traded: push or open a PR at Lv ${TRADE_LEVEL} or higher.`)
  return [
    `${save.nickname ? `${save.nickname} (${sp.name})` : sp.name}${save.isShiny ? ' ★' : ''}  Lv ${save.level}  ${save.personality}`,
    `${toNext}. Lifetime EXP ${save.lifetimeExp}.`,
    'Skills, grown by the EXP that levels it up:', ...skills,
    ...(fed ? [`  Feeding: ${fed} EXP`] : []),
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

/**
 * What the command handlers need from the engine. register.tsx spells each call out (the loader follows
 * `$` only there), so the handlers below stay testable without it.
 */
export type CommandIO = {
  isInteractive: boolean
  now: () => Promise<number>
  /** The save read fresh, rolled when there is none; null when it cannot be used. */
  load: () => Promise<Save | null>
  /** Draws `save` without writing it. */
  show: (save: Save) => Promise<void>
  /** Read fresh, change, write back, draw and announce; null when the save cannot be used. */
  mutate: <T>(change: (s: Save) => { save: Save; events?: readonly GameEvent[] } & T) => Promise<(T & { save: Save }) | null>
  /** Why the save cannot be used. */
  blockedText: () => string
  readRaw: (key: 'save' | 'save.bak') => Promise<unknown>
  writeRaw: (key: 'save' | 'save.bak', value: unknown) => Promise<void>
  /** Copies a raw save to the backup slot unless that would replace a readable backup with an unreadable save. */
  backUp: (raw: unknown) => Promise<boolean>
  /** Puts `save` in place as the live save. */
  install: (save: Save) => Promise<void>
  quietBubble: () => Promise<void>
  copy: (text: string) => Promise<boolean>
  /** The evolution in progress was stopped: its timer must do nothing. */
  evolutionStopped: () => void
  randomSeed: () => number[]
}

/** `/buddy <args>`: the reply to show. */
export async function runCommand(io: CommandIO, args: string): Promise<string> {
  const { sub, rest } = parseArgs(args)
  if (sub === 'help') return helpText(COMMAND)
  if (sub === 'dex' && rest) {
    const s = findSpecies(rest)
    return s ? dexText(s, false) : `No Gen 1 Pokémon called "${rest}".`
  }
  const local = localTime(await io.now())
  switch (sub) {
    case 'stats': {
      const s = await io.load()
      if (s) await io.show(s)
      return s ? statsText(s, local.date) : io.blockedText()
    }
    case 'dex': {
      const s = await io.load()
      return s ? dexText(species(s.species), true) : io.blockedText()
    }
    case 'feed': {
      if (!io.isInteractive) return 'Feeding needs you at the terminal: a run with no one watching (-p, the SDK) earns nothing.'
      const r = await io.mutate(s => feed(s, local))
      if (!r) return io.blockedText()
      const name = species(r.save.species).name
      if (!r.fed) return `${name} has already eaten today. Come back tomorrow.`
      const days = r.save.counters.feedRun
      const streak = `Streak: ${days} day${days === 1 ? '' : 's'}.`
      if (r.gained === 0) return `You fed ${name} a Rare Candy. It is already at Lv 100, so it gains no EXP. ${streak}`
      return `You fed ${name} a Rare Candy. +${r.gained} EXP. ${streak}`
    }
    case 'use': {
      const stone = parseStone(rest)
      if (!stone) return 'Which stone? moon, fire, water, thunder or leaf.'
      let from = 0
      const r = await io.mutate(s => { from = s.species; return useStone(s, stone) })
      if (!r) return io.blockedText()
      if (r.error) return r.error
      return `${species(from).name} evolved into ${species(r.save.species).name}!`
    }
    case 'stop': {
      const r = await io.mutate(s => cancelEvolution(s))
      if (!r) return io.blockedText()
      if (r.cancelled) io.evolutionStopped()
      return r.cancelled ? `Huh? ${species(r.save.species).name} stopped evolving!` : 'Nothing is evolving right now.'
    }
    case 'toggle': {
      const r = await io.mutate(s => ({ save: { ...s, view: s.view === 'full' ? 'compact' as const : 'full' as const } }))
      return r ? `Showing the ${r.save.view} view.` : io.blockedText()
    }
    case 'quiet': {
      const r = await io.mutate(s => ({ save: { ...s, speechOn: !s.speechOn } }))
      if (!r) return io.blockedText()
      if (!r.save.speechOn) await io.quietBubble()
      return r.save.speechOn ? 'Speech is on.' : 'Speech is off. No model calls are made: no reactions and no session judge.'
    }
    case 'nickname': {
      const nickname = [...rest.trim()].slice(0, NICKNAME_MAX).join('') || null
      const r = await io.mutate(s => ({ save: { ...s, nickname } }))
      if (!r) return io.blockedText()
      return nickname ? `Nickname set to ${nickname}.` : 'Nickname cleared.'
    }
    case 'export': {
      const s = await io.load()
      if (!s) return io.blockedText()
      const blob = exportBlob(s)
      return (await io.copy(blob)) ? 'Save copied to the clipboard.' : `Copy this save:\n${blob}`
    }
    case 'import': {
      const parsed = importBlob(rest)
      if (parsed.kind === 'bad') return parsed.reason
      const kept = await io.backUp(await io.readRaw('save'))
      await io.install(parsed.save)
      return `Restored ${species(parsed.save.species).name} at Lv ${parsed.save.level}.${kept ? ' Your previous save is in the backup slot.' : ''}`
    }
    case 'restore': {
      const bak = parseSave(await io.readRaw('save.bak'))
      if (bak.kind !== 'ok') return 'The backup slot does not hold a save this version can read. Nothing was changed.'
      const current = await io.readRaw('save')
      if (current !== undefined) await io.writeRaw('save.bak', current)
      await io.install(bak.save)
      return `Restored ${species(bak.save.species).name} at Lv ${bak.save.level} from the backup slot. The save it replaced is now in the backup slot.`
    }
    case 'reset': {
      // Read only: an unconfirmed reset writes nothing, not even the fresh roll or the backup loadFresh makes.
      const raw = await io.readRaw('save')
      const cur = parseSave(raw)
      if (rest.trim().toLowerCase() !== 'confirm') {
        const what = cur.kind === 'ok' ? `${cur.save.nickname ?? species(cur.save.species).name} (Lv ${cur.save.level})` : 'the current save'
        return `This rolls a new Pokémon at Lv 5 and moves ${what} to the backup slot. It works once a day. Run /buddy reset confirm to go ahead.`
      }
      if (cur.kind === 'ok' && cur.save.lastResetDate !== null && cur.save.lastResetDate >= local.date) {
        return 'You already reset today. Reset works once a day; nothing was changed.'
      }
      const kept = await io.backUp(raw)
      const save = freshSave(io.randomSeed(), local.date)
      await io.install(save)
      return `A wild ${species(save.species).name} appeared at Lv ${save.level}! ${kept ? 'Your previous save is in the backup slot.' : 'The backup slot keeps the backup it already had.'}`
    }
  }
}
