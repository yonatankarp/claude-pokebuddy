import type { Mon, Save } from '../types'
import { CHECKS_MAX, PENDING_LOG_MAX } from './config'
import { STONES } from './data/types'
import { expForLevel, levelForExp } from './exp'
import { FINISHED_MAX, normaliseLine } from './log'
import { rekeyCheck } from './signals'
import { species } from './data/dex'
import { PERSONALITIES, rollFrom } from './roll'
import { SOURCES } from './tally'

export const SAVE_VERSION = 1
export const START_LEVEL = 1
/** Characters (code points, so an emoji is one) a nickname may have. */
export const NICKNAME_MAX = 12

export type { Mon, Save }

export function freshSave(seed: number[]): Save {
  const roll = rollFrom(seed)
  const exp = expForLevel(species(roll.species).growth, START_LEVEL)
  return {
    version: 1, seed, species: roll.species, isShiny: roll.isShiny, personality: roll.personality,
    nickname: null, level: START_LEVEL, exp, lifetimeExp: 0, expBySource: {}, bag: {},
    counters: { greens: 0, commits: 0, configEdits: 0, feedRun: 0 }, checks: {},
    lastMoonDate: null, feed: { lastDate: null }, pendingLog: [], speechOn: true, view: 'full',
    evolution: null, cancelledAtLevel: null, finishedSessions: [],
    box: [], caught: [roll.species], encounters: { date: null, count: 0 },
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
const isNum = (v: unknown, lo: number, hi = Infinity): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
const isDate = (v: unknown) => v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
const COUNTERS = ['greens', 'commits', 'configEdits', 'feedRun']

/**
 * The shape version 1 promises. Unknown keys inside expBySource and bag are ignored (kept, never read),
 * so a point release may add a source or an item without old builds calling the save corrupt.
 * finishedSessions, box, caught and encounters came later and are optional (see normalise). Other unknown
 * top-level keys, such as the lastResetDate older builds wrote, are ignored.
 * Any other change to the shape needs a version bump: a build that cannot read a save sets it aside and rolls a new buddy.
 */
function validSave(raw: Record<string, unknown>): boolean {
  if (raw.version !== 1) return false
  if (!Array.isArray(raw.seed) || raw.seed.length !== 4 || !raw.seed.every(n => typeof n === 'number' && Number.isInteger(n))) return false
  if (!isInt(raw.species, 1, 151) || !isInt(raw.level, 1, 100)) return false
  const growth = species(raw.species as number).growth
  // The level is the one its EXP reaches: no Gen 1 evolution changes the growth rate, so this holds through them.
  if (!isNum(raw.exp, 0, expForLevel(growth, 100)) || levelForExp(growth, raw.exp) !== raw.level) return false
  if (!isNum(raw.lifetimeExp, 0)) return false
  if (typeof raw.isShiny !== 'boolean' || !(PERSONALITIES as readonly unknown[]).includes(raw.personality)) return false
  if (raw.nickname !== null && (typeof raw.nickname !== 'string' || [...raw.nickname].length > NICKNAME_MAX)) return false
  if (!isObj(raw.expBySource) || !Object.entries(raw.expBySource).every(([k, v]) => !(SOURCES as readonly string[]).includes(k) || isNum(v, 0))) return false
  if (!isObj(raw.bag) || !Object.entries(raw.bag).every(([k, v]) => !(STONES as readonly string[]).includes(k) || isInt(v, 0, Number.MAX_SAFE_INTEGER))) return false
  if (!isObj(raw.counters) || !COUNTERS.every(k => isInt((raw.counters as Record<string, unknown>)[k], 0, Number.MAX_SAFE_INTEGER))) return false
  if (!isObj(raw.checks) || !Object.values(raw.checks).every(v => typeof v === 'boolean')) return false
  if (!isDate(raw.lastMoonDate)) return false
  if (!isObj(raw.feed) || !isDate(raw.feed.lastDate)) return false
  if (!Array.isArray(raw.pendingLog) || raw.pendingLog.length > PENDING_LOG_MAX || !raw.pendingLog.every(x => typeof x === 'string')) return false
  if (typeof raw.speechOn !== 'boolean' || (raw.view !== 'compact' && raw.view !== 'full')) return false
  const evolvesInto = species(raw.species as number).evolutions.map(e => e.to)
  if (raw.evolution !== null && !(isObj(raw.evolution) && evolvesInto.includes(raw.evolution.to as number))) return false
  if (raw.cancelledAtLevel !== null && !isInt(raw.cancelledAtLevel, 1, 100)) return false
  if (raw.finishedSessions !== undefined && !(Array.isArray(raw.finishedSessions) && raw.finishedSessions.every(x => typeof x === 'string'))) return false
  return true
}

/** A box entry this build can use; normalise drops the rest, so one bad entry never costs the active Pokémon. */
function validMon(m: unknown): m is Mon {
  if (!isObj(m) || !isInt(m.species, 1, 151) || !isInt(m.level, 1, 100)) return false
  const growth = species(m.species as number).growth
  if (!isNum(m.exp, 0, expForLevel(growth, 100)) || levelForExp(growth, m.exp) !== m.level) return false
  if (typeof m.isShiny !== 'boolean' || !(PERSONALITIES as readonly unknown[]).includes(m.personality)) return false
  return m.nickname === null || (typeof m.nickname === 'string' && [...m.nickname].length <= NICKNAME_MAX)
}

export function parseSave(raw: unknown):
  | { kind: 'ok'; save: Save } | { kind: 'empty' } | { kind: 'future'; version: number } | { kind: 'corrupt' } {
  if (raw === undefined || raw === null) return { kind: 'empty' }
  if (!isObj(raw)) return { kind: 'corrupt' }
  if (typeof raw.version === 'number' && raw.version > SAVE_VERSION) return { kind: 'future', version: raw.version }
  return validSave(raw) ? { kind: 'ok', save: normalise(raw as unknown as Save) } : { kind: 'corrupt' }
}

/**
 * Older builds keyed checks by the whole command and logged it whole: both are cut down to check keys
 * (two old keys that become one keep the newer place), and each log line to LOG_LINE_MAX. More than
 * CHECKS_MAX checks keep the newest (scoreTally adds them last); a save without finishedSessions gets [].
 * The box keeps the entries this build can read; caught always holds the Pokémon the save has, so an
 * evolution or a save from before the box counts without a write of its own.
 */
function normalise(save: Save): Save {
  const rekeyed: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(save.checks)) {
    const key = rekeyCheck(k)
    delete rekeyed[key]
    rekeyed[key] = v
  }
  const checks = Object.entries(rekeyed)
  const raw = save as Partial<Pick<Save, 'box' | 'caught' | 'encounters'>>
  const box = Array.isArray(raw.box) ? raw.box.filter(validMon).map(m => ({
    species: m.species, isShiny: m.isShiny, personality: m.personality, nickname: m.nickname, level: m.level, exp: m.exp,
  })) : []
  const caught = Array.isArray(raw.caught) ? raw.caught.filter(n => isInt(n, 1, 151)) : []
  const encounters = isObj(raw.encounters) && isDate(raw.encounters.date) && isInt(raw.encounters.count, 0, Number.MAX_SAFE_INTEGER)
    ? { date: raw.encounters.date, count: raw.encounters.count } : { date: null, count: 0 }
  return {
    ...save,
    checks: Object.fromEntries(checks.slice(-CHECKS_MAX)),
    pendingLog: save.pendingLog.map(normaliseLine),
    finishedSessions: (save.finishedSessions ?? []).slice(-FINISHED_MAX),
    box,
    caught: [...new Set([...caught, save.species, ...box.map(m => m.species)])].sort((a, b) => a - b),
    encounters,
  }
}
