import { describe, expect, test } from 'claude-code/testing'
import { base64Encode, fnv1a, utf8 } from '../hooks/codec'
import { PENDING_LOG_MAX } from '../hooks/config'
import { species } from '../hooks/data/dex'
import { expForLevel } from '../hooks/exp'
import { exportBlob, freshSave, importBlob, parseSave } from '../hooks/state'

describe('save', () => {
  test('fresh save starts at level 5 with matching EXP', () => {
    const s = freshSave([1, 2, 3, 4])
    expect(s.level).toBe(5)
    expect(s.exp > 0).toBe(true)
    expect(s.version).toBe(1)
  })
  test('parse: empty, ok, future, corrupt', () => {
    expect(parseSave(undefined).kind).toBe('empty')
    const s = freshSave([1, 2, 3, 4])
    expect(parseSave(JSON.parse(JSON.stringify(s)))).toEqual({ kind: 'ok', save: s })
    expect(parseSave({ ...s, version: 2 })).toEqual({ kind: 'future', version: 2 })
    expect(parseSave({ version: 1, species: 'pikachu' }).kind).toBe('corrupt')
    expect(parseSave('nonsense').kind).toBe('corrupt')
    expect(parseSave({ ...s, species: 999 }).kind).toBe('corrupt')
  })
  test('export and import round-trip; tampering is refused', () => {
    const s = { ...freshSave([5, 6, 7, 8]), nickname: 'Sparky ⚡' }
    const blob = exportBlob(s)
    expect(importBlob(blob)).toEqual({ kind: 'ok', save: s })
    const body = JSON.stringify(s)
    const tampered = base64Encode(utf8(`${fnv1a(body)}.${body.replace('Sparky', 'Sparkz')}`))
    const bad = importBlob(tampered)
    expect(bad.kind).toBe('bad')
    expect(bad.kind === 'bad' && bad.reason).toContain('checksum')
    expect(importBlob('hello').kind).toBe('bad')
  })
  test('import tolerates whitespace and newlines inside the blob', () => {
    const s = freshSave([5, 6, 7, 8])
    const blob = exportBlob(s)
    const wrapped = blob.replace(/(.{20})/g, '$1\n  ')
    expect(importBlob(wrapped)).toEqual({ kind: 'ok', save: s })
  })
  const s = freshSave([1, 2, 3, 4])
  const corrupt = (patch: Record<string, unknown>) => parseSave({ ...s, ...patch }).kind
  test('rejects bad seeds', () => {
    expect(corrupt({ seed: [1, 2, 3] })).toBe('corrupt')
    expect(corrupt({ seed: [1, 2, 3, 1.5] })).toBe('corrupt')
    expect(corrupt({ seed: [1, 2, 3, Infinity] })).toBe('corrupt')
  })
  test('rejects bad counters', () => {
    expect(corrupt({ counters: { greens: 0 } })).toBe('corrupt')
    expect(corrupt({ counters: { greens: -1, commits: 0, configEdits: 0, feedRun: 0 } })).toBe('corrupt')
    expect(corrupt({ counters: { greens: 0, commits: 0.5, configEdits: 0, feedRun: 0 } })).toBe('corrupt')
  })
  test('rejects bad evolution and cancelledAtLevel', () => {
    expect(corrupt({ evolution: { to: 0 } })).toBe('corrupt')
    expect(corrupt({ evolution: { to: 152 } })).toBe('corrupt')
    expect(corrupt({ evolution: 5 })).toBe('corrupt')
    expect(corrupt({ evolution: { to: 5 } })).toBe('ok')
    expect(corrupt({ cancelledAtLevel: 0 })).toBe('corrupt')
    expect(corrupt({ cancelledAtLevel: 101 })).toBe('corrupt')
  })
  test('rejects NaN, Infinity and out-of-range EXP', () => {
    expect(corrupt({ exp: NaN })).toBe('corrupt')
    expect(corrupt({ exp: Infinity })).toBe('corrupt')
    expect(corrupt({ lifetimeExp: -1 })).toBe('corrupt')
    expect(corrupt({ lifetimeExp: NaN })).toBe('corrupt')
    expect(corrupt({ exp: expForLevel(species(s.species).growth, 100) + 1 })).toBe('corrupt')
  })
  test('rejects EXP below the level floor', () => {
    const floor = expForLevel(species(s.species).growth, 50)
    expect(corrupt({ level: 50, exp: floor - 1 })).toBe('corrupt')
    expect(corrupt({ level: 50, exp: floor })).toBe('ok')
  })
  test('rejects bad view, speechOn, isShiny, personality, nickname', () => {
    expect(corrupt({ view: 'huge' })).toBe('corrupt')
    expect(corrupt({ speechOn: 'yes' })).toBe('corrupt')
    expect(corrupt({ isShiny: 1 })).toBe('corrupt')
    expect(corrupt({ personality: 'moody' })).toBe('corrupt')
    expect(corrupt({ nickname: 'x'.repeat(13) })).toBe('corrupt')
    expect(corrupt({ nickname: 7 })).toBe('corrupt')
  })
  test('rejects oversized or non-string pendingLog', () => {
    expect(corrupt({ pendingLog: Array(PENDING_LOG_MAX + 1).fill('x') })).toBe('corrupt')
    expect(corrupt({ pendingLog: [1] })).toBe('corrupt')
    expect(corrupt({ pendingLog: Array(PENDING_LOG_MAX).fill('x') })).toBe('ok')
  })
  test('rejects bad bag, expBySource and checks', () => {
    expect(corrupt({ bag: { 'fire-stone': -1 } })).toBe('corrupt')
    expect(corrupt({ bag: { 'fire-stone': 1.5 } })).toBe('corrupt')
    expect(corrupt({ expBySource: { tool: NaN } })).toBe('corrupt')
    expect(corrupt({ checks: { k: 'true' } })).toBe('corrupt')
  })
  test('unknown keys in expBySource and bag are ignored, so a newer point release still reads', () => {
    expect(corrupt({ bag: { 'mystery-stone': 1 } })).toBe('ok')
    expect(corrupt({ bag: { 'mystery-stone': 'x' } })).toBe('ok')
    expect(corrupt({ expBySource: { bogus: 1 } })).toBe('ok')
  })
  test('checks hold at most 100 keys', () => {
    const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, true]))
    expect(corrupt({ checks: many(100) })).toBe('ok')
    expect(corrupt({ checks: many(101) })).toBe('corrupt')
  })
  test('rejects bad date strings', () => {
    expect(corrupt({ lastMoonDate: 'yesterday' })).toBe('corrupt')
    expect(corrupt({ lastMoonDate: '2026-1-1' })).toBe('corrupt')
    expect(corrupt({ feed: { lastDate: '10/11/2026' } })).toBe('corrupt')
    expect(corrupt({ feed: {} })).toBe('corrupt')
    expect(corrupt({ lastMoonDate: '2026-10-11', feed: { lastDate: '2026-10-11' } })).toBe('ok')
  })
})
