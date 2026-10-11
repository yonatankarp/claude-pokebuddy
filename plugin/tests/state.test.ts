import { describe, expect, test } from 'claude-code/testing'
import { base64Encode, fnv1a, utf8 } from '../hooks/codec'
import { LOG_LINE_MAX, PENDING_LOG_MAX } from '../hooks/config'
import { species } from '../hooks/data/dex'
import { expForLevel } from '../hooks/exp'
import { exportBlob, freshSave, importBlob, parseSave } from '../hooks/state'

describe('save', () => {
  test('fresh save starts at level 5 with matching EXP', () => {
    const s = freshSave([1, 2, 3, 4])
    expect(s.level).toBe(5)
    expect(s.exp > 0).toBe(true)
    expect(s.version).toBe(1)
    expect(s.view).toBe('full')
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
  test('lastResetDate: missing reads as null, a date or null is kept, anything else is corrupt', () => {
    const s = freshSave([1, 2, 3, 4])
    expect(s.lastResetDate).toBe(null)
    const { lastResetDate: _, ...old } = s
    expect(parseSave(old)).toEqual({ kind: 'ok', save: { ...old, lastResetDate: null } })
    expect(parseSave({ ...s, lastResetDate: '2026-10-11' }).kind).toBe('ok')
    expect(parseSave({ ...s, lastResetDate: 'yesterday' }).kind).toBe('corrupt')
    expect(freshSave([1, 2, 3, 4], '2026-10-11').lastResetDate).toBe('2026-10-11')
  })
  test('finishedSessions: missing reads as [], a list of up to 50 ids is kept, anything else is corrupt', () => {
    const s = freshSave([1, 2, 3, 4])
    const { finishedSessions: _, ...old } = s
    expect(parseSave(old)).toEqual({ kind: 'ok', save: { ...old, finishedSessions: [] } })
    expect(parseSave({ ...s, finishedSessions: ['a', 'b'] }).kind).toBe('ok')
    expect(parseSave({ ...s, finishedSessions: [1] }).kind).toBe('corrupt')
    expect(parseSave({ ...s, finishedSessions: Array(51).fill('a') }).kind).toBe('corrupt')
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
  test('more than 100 checks load trimmed to the newest 100, the raw value untouched', () => {
    const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, true]))
    expect(corrupt({ checks: many(100) })).toBe('ok')
    const raw = { ...freshSave([1, 2, 3, 4]), checks: many(101) }
    const r = parseSave(raw)
    expect(r.kind).toBe('ok')
    expect(r.kind === 'ok' && Object.keys(r.save.checks)).toEqual(Object.keys(many(101)).slice(1))
    expect(Object.keys(raw.checks)).toHaveLength(101)
  })
  test('rejects bad date strings', () => {
    expect(corrupt({ lastMoonDate: 'yesterday' })).toBe('corrupt')
    expect(corrupt({ lastMoonDate: '2026-1-1' })).toBe('corrupt')
    expect(corrupt({ feed: { lastDate: '10/11/2026' } })).toBe('corrupt')
    expect(corrupt({ feed: {} })).toBe('corrupt')
    expect(corrupt({ lastMoonDate: '2026-10-11', feed: { lastDate: '2026-10-11' } })).toBe('ok')
  })
  test('an older save\'s whole-command check keys load cut down, two that become one keeping the newer place', () => {
    const raw = { ...freshSave([1, 2, 3, 4]), checks: { 'pytest --password=x': true, 'npm test': true, 'pytest -q tests/a.py': true } }
    const r = parseSave(raw)
    expect(r.kind === 'ok' && r.save.checks).toEqual({ 'npm test': true, pytest: true })
    expect(r.kind === 'ok' && Object.keys(r.save.checks)).toEqual(['npm test', 'pytest'])
  })
  test('an older save\'s log lines load with check commands cut down and each line capped', () => {
    const long = 'x'.repeat(LOG_LINE_MAX + 50)
    const raw = { ...freshSave([1, 2, 3, 4]), pendingLog: ['S\t1 prompt; checks: make test TOKEN=abc failed, pytest -k s passed; edited config: CLAUDE.md', long] }
    const r = parseSave(raw)
    expect(r.kind === 'ok' && r.save.pendingLog).toEqual(['S\t1 prompt; checks: make test failed, pytest passed; edited config: CLAUDE.md', long.slice(0, LOG_LINE_MAX)])
  })
})
