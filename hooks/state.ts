import { base64Decode, base64Encode, fnv1a, fromUtf8, utf8 } from './codec'
import type { Stone } from './data/types'
import type { Counters } from './evolution'
import { expForLevel } from './exp'
import { species } from './data/dex'
import { PERSONALITIES, rollFrom, type Personality } from './roll'
import type { Source } from './tally'

export const SAVE_VERSION = 1
export const START_LEVEL = 5

export type Save = {
  version: 1
  seed: number[]
  species: number
  isShiny: boolean
  personality: Personality
  nickname: string | null
  level: number
  exp: number
  lifetimeExp: number
  expBySource: Partial<Record<Source, number>>
  bag: Partial<Record<Stone, number>>
  counters: Counters
  checks: Record<string, boolean>
  lastMoonDate: string | null
  feed: { lastDate: string | null }
  pendingLog: string[]
  speechOn: boolean
  view: 'compact' | 'full'
  evolution: { to: number } | null
  cancelledAtLevel: number | null
}

export function freshSave(seed: number[]): Save {
  const roll = rollFrom(seed)
  const exp = expForLevel(species(roll.species).growth, START_LEVEL)
  return {
    version: 1, seed, species: roll.species, isShiny: roll.isShiny, personality: roll.personality,
    nickname: null, level: START_LEVEL, exp, lifetimeExp: 0, expBySource: {}, bag: {},
    counters: { greens: 0, commits: 0, configEdits: 0, feedRun: 0 }, checks: {},
    lastMoonDate: null, feed: { lastDate: null }, pendingLog: [], speechOn: true, view: 'compact',
    evolution: null, cancelledAtLevel: null,
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi

export function parseSave(raw: unknown):
  | { kind: 'ok'; save: Save } | { kind: 'empty' } | { kind: 'future'; version: number } | { kind: 'corrupt' } {
  if (raw === undefined || raw === null) return { kind: 'empty' }
  if (!isObj(raw)) return { kind: 'corrupt' }
  if (typeof raw.version === 'number' && raw.version > SAVE_VERSION) return { kind: 'future', version: raw.version }
  const ok =
    raw.version === 1 &&
    Array.isArray(raw.seed) && raw.seed.length === 4 &&
    isInt(raw.species, 1, 151) && isInt(raw.level, 1, 100) &&
    typeof raw.exp === 'number' && typeof raw.lifetimeExp === 'number' &&
    typeof raw.isShiny === 'boolean' && (PERSONALITIES as readonly unknown[]).includes(raw.personality) &&
    isObj(raw.counters) && isObj(raw.bag) && isObj(raw.feed) && Array.isArray(raw.pendingLog)
  return ok ? { kind: 'ok', save: raw as unknown as Save } : { kind: 'corrupt' }
}

export function exportBlob(save: Save): string {
  const body = JSON.stringify(save)
  return base64Encode(utf8(`${fnv1a(body)}.${body}`))
}

export function importBlob(blob: string): { kind: 'ok'; save: Save } | { kind: 'bad'; reason: string } {
  let text: string
  try { text = fromUtf8(base64Decode(blob.trim())) } catch { return { kind: 'bad', reason: 'That is not a pokebuddy export.' } }
  const dot = text.indexOf('.')
  const sum = text.slice(0, dot), body = text.slice(dot + 1)
  if (dot !== 8 || fnv1a(body) !== sum) return { kind: 'bad', reason: 'The export is damaged (checksum mismatch).' }
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { return { kind: 'bad', reason: 'The export is damaged (not JSON).' } }
  const r = parseSave(parsed)
  if (r.kind === 'ok') return r
  if (r.kind === 'future') return { kind: 'bad', reason: `The export is from a newer version (save v${r.version}). Update the mod first.` }
  return { kind: 'bad', reason: 'The export does not hold a valid save.' }
}
