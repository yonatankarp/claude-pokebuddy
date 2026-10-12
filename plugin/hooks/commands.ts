import { catchWild, findInBox, JUDGE_ENCOUNTER, release, switchTo } from './collection'
import { COMMAND } from './config'
import { findSpecies, species } from './data/dex'
import { STONES, stoneName, type Species, type Stone } from './data/types'
import { TRADE_LEVEL } from './evolution'
import { expForLevel, MAX_LEVEL } from './exp'
import { cancelEvolution, feed, useStone, type GameEvent } from './game'
import { localTime, previousDate } from './localtime'
import { NICKNAME_MAX, type Save } from './state'
import type { Source } from './tally'

const SUBS = ['stats', 'dex', 'feed', 'use', 'stop', 'toggle', 'quiet', 'nickname', 'box', 'switch', 'release'] as const
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
export function feedStreak(save: Save, today: string): number {
  const last = save.feed.lastDate
  return last !== null && last >= previousDate(today) ? save.counters.feedRun : 0
}

/** Progress to the next stone of each kind: the work that earns it, done of needed. */
export function stoneProgress(save: Save, today: string): { stone: Stone; name: string; done: number; of: number; work: string }[] {
  const c = save.counters
  const leaf = feedStreak(save, today)
  return [
    { stone: 'thunder-stone', name: 'Thunder Stone', done: c.greens % 10, of: 10, work: 'green checks' },
    { stone: 'fire-stone', name: 'Fire Stone', done: c.commits % 10, of: 10, work: 'commits' },
    { stone: 'water-stone', name: 'Water Stone', done: c.configEdits % 10, of: 10, work: 'config edits' },
    { stone: 'leaf-stone', name: 'Leaf Stone', done: leaf % 7, of: 7, work: 'feed days' },
  ]
}

/** How the species evolves, one line per evolution. */
export function evolutionHints(sp: Species): string[] {
  return sp.evolutions.map(e =>
    e.kind === 'level' ? `Evolves into ${species(e.to).name} at Lv ${e.level}.`
    : e.kind === 'stone' ? `Evolves into ${species(e.to).name} with a ${stoneName(e.stone)}.`
    : `Evolves into ${species(e.to).name} when traded: push or open a PR at Lv ${TRADE_LEVEL} or higher.`)
}

export function statsText(save: Save, today: string): string {
  const sp = species(save.species)
  const toNext = save.level >= MAX_LEVEL ? 'max level' : `${expForLevel(sp.growth, save.level + 1) - save.exp} EXP to Lv ${save.level + 1}`
  const bag = STONES.filter(s => save.bag[s]).map(s => `${stoneName(s)} ×${save.bag[s]}`).join(', ') || 'empty'
  const skills = skillStats(save).map(k =>
    `  ${k.name.padEnd(9)} ${String(k.value).padStart(2)}  ${k.exp} EXP from ${k.from.map(src => SOURCE_NAMES[src]).join(', ')}`)
  const fed = save.expBySource.feed ?? 0
  const streak = feedStreak(save, today)
  const hints = evolutionHints(sp)
  return [
    `${save.nickname ? `${save.nickname} (${sp.name})` : sp.name}${save.isShiny ? ' ★' : ''}  Lv ${save.level}  ${save.personality}`,
    `${toNext}. Lifetime EXP ${save.lifetimeExp}.`,
    'Skills, grown by the EXP that levels it up:', ...skills,
    ...(fed ? [`  Feeding: ${fed} EXP`] : []),
    ...(hints.length ? hints : ['Does not evolve.']),
    `Bag: ${bag}`,
    `Feed streak: ${streak} day${streak === 1 ? '' : 's'}.`,
    'Next stones:', ...stoneProgress(save, today).map(p => `  ${p.name} ${p.done}/${p.of} ${p.work}`),
  ].join('\n')
}

/** The active Pokémon's name as the person sees it. */
function monName(s: { species: number; nickname: string | null }): string {
  return s.nickname ? `${s.nickname} (${species(s.species).name})` : species(s.species).name
}

export function boxText(save: Save): string {
  const line = (m: { species: number; nickname: string | null; isShiny: boolean; level: number }) => `${monName(m)}${m.isShiny ? ' ★' : ''}  Lv ${m.level}`
  return [
    `Buddy: ${line(save)}`,
    save.box.length ? 'Box:' : `Box: empty. Wild Pokémon turn up at random as you work: fixing checks, committing, a session judged ${JUDGE_ENCOUNTER}+ or a 7-day feed streak.`,
    ...save.box.map((m, i) => `  ${i + 1}. ${line(m)}`),
    `Caught ${save.caught.length} / 151.`,
  ].join('\n')
}

export function dexText(s: Species, owned: boolean): string {
  return [
    `#${String(s.id).padStart(3, '0')} ${s.name}${owned ? '  (yours)' : ''}`,
    `Type: ${s.types.join(' / ')}   Height: ${(s.height / 10).toFixed(1)} m   Weight: ${(s.weight / 10).toFixed(1)} kg`,
    s.dex,
  ].join('\n')
}

/** Every sub-command and what it does: the help text and the panel's Help tab. */
export const COMMAND_HELP: readonly [args: string, about: string][] = [
  ['stats', 'Your Pokémon and progress as text'],
  ['dex [name or number]', 'A Pokédex entry'],
  ['feed', 'A Rare Candy, once a day'],
  ['use <stone>', 'Evolve with a stone from your bag'],
  ['stop', 'Cancel an evolution in progress'],
  ['toggle', 'Full or compact view of the band'],
  ['quiet', 'Speech and the judge on or off'],
  ['nickname [name]', 'Set a nickname; no name clears it'],
  ['box', 'Your caught Pokémon'],
  ['switch <number or name>', 'Make a boxed Pokémon your buddy'],
  ['release <number> confirm', 'Let a boxed Pokémon go for good'],
]

export function helpText(command: string): string {
  return COMMAND_HELP.map(([args, about]) => `/${command} ${args}: ${about}`).join('\n')
}

/**
 * What the command handlers need from the engine. register.tsx spells each call out (the loader follows
 * `$` only there), so the handlers below stay testable without it.
 */
export type CommandIO = {
  isInteractive: boolean
  now: () => Promise<number>
  /** The save read fresh, rolled when there is none or it is damaged; null when it is from a newer version. */
  load: () => Promise<Save | null>
  /** Draws `save` without writing it. */
  show: (save: Save) => Promise<void>
  /** Read fresh, change, write back, draw and announce; null when the save cannot be used. */
  mutate: <T>(change: (s: Save) => { save: Save; events?: readonly GameEvent[] } & T) => Promise<(T & { save: Save }) | null>
  /** Why the save cannot be used: it is from a newer version. */
  blockedText: () => string
  quietBubble: () => Promise<void>
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
      return s ? `${dexText(species(s.species), true)}\nCaught ${s.caught.length} / 151.` : io.blockedText()
    }
    case 'box': {
      const s = await io.load()
      return s ? boxText(s) : io.blockedText()
    }
    case 'switch': {
      let error: string | undefined
      const r = await io.mutate(s => {
        const i = findInBox(s, rest)
        const out = i === null ? { save: s, error: `No Pokémon called "${rest}" in your box. /${COMMAND} box lists them.` } : switchTo(s, i)
        error = out.error
        return { save: out.save }
      })
      if (!r) return io.blockedText()
      return error ?? `${monName(r.save)} is your buddy now.`
    }
    case 'release': {
      const [which = '', word = ''] = rest.split(/\s+/)
      const s = await io.load()
      if (!s) return io.blockedText()
      const i = findInBox(s, which)
      if (i === null) return `No Pokémon at "${which}" in your box. /${COMMAND} box lists them.`
      const m = s.box[i]!
      if (word.toLowerCase() !== 'confirm') return `This lets ${m.nickname ?? species(m.species).name} (Lv ${m.level}) go for good. Run /${COMMAND} release ${i + 1} confirm to go ahead.`
      // The entry read above, matched whole: a box another session changed meanwhile never loses the wrong one.
      const same = (b: typeof m) => (Object.keys(m) as (keyof typeof m)[]).every(k => b[k] === m[k])
      const r = await io.mutate(cur => {
        const at = cur.box[i] && same(cur.box[i]) ? i : cur.box.findIndex(same)
        return at === -1 ? { save: cur, released: undefined } : release(cur, at)
      })
      if (!r) return io.blockedText()
      if (!r.released) return `Your box changed meanwhile; nothing was released. /${COMMAND} box lists it now.`
      return `Bye, ${m.nickname ?? species(m.species).name}!`
    }
    case 'feed': {
      if (!io.isInteractive) return 'Feeding needs you at the terminal: a run with no one watching (-p, the SDK) earns nothing.'
      const r = await io.mutate(s => {
        const fed = feed(s, local)
        // Every 7th day of a feed streak a lucky wild Pokémon comes to eat too.
        if (!fed.fed || fed.save.counters.feedRun % 7 !== 0) return fed
        const met = catchWild(fed.save, 1, io.randomSeed, local.date, true)
        return { ...fed, save: met.save, events: [...fed.events, ...met.events] }
      })
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
  }
}
