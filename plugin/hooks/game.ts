import { species } from './data/dex'
import { stoneName, type Stone } from './data/types'
import { levelEvolution, stoneEvolution, stonesEarned, tradeEvolution, type Counters } from './evolution'
import { expForLevel, levelForExp, MAX_LEVEL } from './exp'
import { previousDate, type LocalTime } from './localtime'
import type { Save } from './state'
import type { scoreTally, Source } from './tally'

export type GameEvent =
  | { kind: 'level'; level: number }
  | { kind: 'evolving'; from: number; to: number }
  | { kind: 'evolved'; from: number; to: number }
  | { kind: 'stone'; stone: Stone }
  | { kind: 'max' }
  | { kind: 'caught'; species: number; isShiny: boolean }

type Result = { save: Save; events: GameEvent[] }

export function applyExp(save: Save, gained: Partial<Record<Source, number>>): Result {
  const clean = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)
  const total = Object.values(gained).reduce((a, n) => a + clean(n), 0)
  const expBySource = { ...save.expBySource }
  for (const [k, n] of Object.entries(gained)) {
    if (clean(n) > 0) expBySource[k as Source] = (expBySource[k as Source] ?? 0) + clean(n)
  }
  const growth = species(save.species).growth
  const cap = expForLevel(growth, MAX_LEVEL)
  const exp = Math.min(cap, save.exp + total)
  const level = Math.max(save.level, levelForExp(growth, exp))
  const events: GameEvent[] = []
  for (let l = save.level + 1; l <= level; l++) events.push({ kind: 'level', level: l })
  if (level === MAX_LEVEL && save.level < MAX_LEVEL) events.push({ kind: 'max' })
  let next: Save = { ...save, exp, level, lifetimeExp: save.lifetimeExp + total, expBySource }
  if (level > save.level && !next.evolution) {
    const to = levelEvolution(next.species, level, next.cancelledAtLevel)
    if (to !== null) {
      next = { ...next, evolution: { to } }
      events.push({ kind: 'evolving', from: next.species, to })
    }
  }
  return { save: next, events }
}

function evolveTo(save: Save, to: number): Result {
  const from = save.species
  return { save: { ...save, species: to, evolution: null, cancelledAtLevel: null }, events: [{ kind: 'evolved', from, to }] }
}

/** Ends the evolution in progress; a level the new species has already passed starts its next one. */
export function finishEvolution(save: Save): Result {
  if (!save.evolution) return { save, events: [] }
  const done = evolveTo(save, save.evolution.to)
  const next = levelEvolution(done.save.species, done.save.level, null)
  if (next === null) return done
  return {
    save: { ...done.save, evolution: { to: next } },
    events: [...done.events, { kind: 'evolving', from: done.save.species, to: next }],
  }
}

export function cancelEvolution(save: Save): { save: Save; cancelled: boolean } {
  if (!save.evolution) return { save, cancelled: false }
  return { save: { ...save, evolution: null, cancelledAtLevel: save.level }, cancelled: true }
}

function addStones(save: Save, before: Counters): Result {
  const earned = stonesEarned(before, save.counters)
  const bag = { ...save.bag }
  for (const s of earned) bag[s] = (bag[s] ?? 0) + 1
  return { save: { ...save, bag }, events: earned.map(stone => ({ kind: 'stone' as const, stone })) }
}

export function applyTurn(save: Save, scored: ReturnType<typeof scoreTally>, local: LocalTime): Result {
  const before = save.counters
  let s: Save = {
    ...save,
    checks: { ...scored.checks },
    counters: {
      ...before,
      greens: before.greens + scored.greens,
      commits: before.commits + scored.commits,
      configEdits: before.configEdits + scored.configEdits,
    },
  }
  const events: GameEvent[] = []
  const stones = addStones(s, before)
  s = stones.save
  events.push(...stones.events)
  if (local.hour < 5 && s.lastMoonDate !== local.date) {
    s = { ...s, lastMoonDate: local.date, bag: { ...s.bag, 'moon-stone': (s.bag['moon-stone'] ?? 0) + 1 } }
    events.push({ kind: 'stone', stone: 'moon-stone' })
  }
  const exp = applyExp(s, scored.bySource)
  s = exp.save
  events.push(...exp.events)
  if (scored.pushes > 0 && !s.evolution) {
    const to = tradeEvolution(s.species, s.level)
    if (to !== null) {
      const t = evolveTo(s, to)
      s = t.save
      events.push(...t.events)
    }
  }
  return { save: s, events }
}

export function feed(save: Save, local: LocalTime): Result & { fed: boolean; gained: number } {
  // `>=`: a clock moved back to an earlier day cannot feed again.
  if (save.feed.lastDate !== null && save.feed.lastDate >= local.date) return { save, events: [], fed: false, gained: 0 }
  const run = save.feed.lastDate === previousDate(local.date) ? save.counters.feedRun + 1 : 1
  const growth = species(save.species).growth
  const toNext = save.level >= MAX_LEVEL ? 0 : expForLevel(growth, save.level + 1) - save.exp
  const bonus = Math.floor(toNext * 0.1 * Math.min(run, 7))
  const before = save.counters
  const s: Save = { ...save, feed: { lastDate: local.date }, counters: { ...before, feedRun: run } }
  const stones = addStones(s, before)
  const exp = applyExp(stones.save, { feed: toNext + bonus })
  return { save: exp.save, events: [...stones.events, ...exp.events], fed: true, gained: toNext + bonus }
}

export function useStone(save: Save, stone: Stone): Result & { error?: string } {
  if ((save.bag[stone] ?? 0) <= 0) return { save, events: [], error: `You have no ${stoneName(stone)}.` }
  const to = stoneEvolution(save.species, stone)
  if (to === null) return { save, events: [], error: `${species(save.species).name} cannot use a ${stoneName(stone)}.` }
  const spent = { ...save, bag: { ...save.bag, [stone]: (save.bag[stone] ?? 0) - 1 } }
  return evolveTo(spent, to)
}
