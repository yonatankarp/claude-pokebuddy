import { describe, expect, test } from 'claude-code/testing'
import { LOG_LINE_MAX, PENDING_LOG_MAX } from '../hooks/config'
import { species } from '../hooks/data/dex'
import { expForLevel } from '../hooks/exp'
import { freshSave, parseSave } from '../hooks/state'

describe('save', () => {
  test('fresh save starts at level 1 with no EXP', () => {
    const s = freshSave([1, 2, 3, 4])
    expect(s.level).toBe(1)
    expect(s.exp).toBe(0)
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
  test('the lastResetDate an older build wrote is ignored, whatever it holds', () => {
    const s = freshSave([1, 2, 3, 4])
    expect(parseSave({ ...s, lastResetDate: '2026-10-11' }).kind).toBe('ok')
    expect(parseSave({ ...s, lastResetDate: 'yesterday' }).kind).toBe('ok')
  })
  test('finishedSessions: missing reads as [], a longer list keeps the newest 50, anything else is corrupt', () => {
    const s = freshSave([1, 2, 3, 4])
    const { finishedSessions: _, ...old } = s
    expect(parseSave(old)).toEqual({ kind: 'ok', save: { ...old, finishedSessions: [] } })
    expect(parseSave({ ...s, finishedSessions: ['a', 'b'] }).kind).toBe('ok')
    expect(parseSave({ ...s, finishedSessions: [1] }).kind).toBe('corrupt')
    const many = parseSave({ ...s, finishedSessions: Array.from({ length: 60 }, (_, i) => `s${i}`) })
    expect(many.kind === 'ok' && many.save.finishedSessions).toEqual(Array.from({ length: 50 }, (_, i) => `s${i + 10}`))
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
    expect(corrupt({ species: 4, level: 5, exp: expForLevel(species(4).growth, 5), evolution: { to: 5 } })).toBe('ok')
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
  test('rejects a level its EXP does not reach and EXP past the next level', () => {
    const growth = species(s.species).growth
    expect(corrupt({ exp: expForLevel(growth, 2) })).toBe('corrupt')
    expect(corrupt({ exp: expForLevel(growth, 2) - 1 })).toBe('ok')
    expect(corrupt({ level: 100, exp: expForLevel(growth, 100) })).toBe('ok')
  })
  test('an evolution in progress must be one the species has', () => {
    const charmander = { species: 4, level: 16, exp: expForLevel(species(4).growth, 16) }
    expect(corrupt({ ...charmander, evolution: { to: 5 } })).toBe('ok')
    expect(corrupt({ ...charmander, evolution: { to: 150 } })).toBe('corrupt')
  })
  test('a nickname is up to 12 characters, an emoji counting as one', () => {
    expect(corrupt({ nickname: '🔥'.repeat(12) })).toBe('ok')
    expect(corrupt({ nickname: '🔥'.repeat(13) })).toBe('corrupt')
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
  test('an older save\'s log lines keep only the parts this build writes', () => {
    const raw = { ...freshSave([1, 2, 3, 4]), pendingLog: [
      'S\t2 prompts; 3 tool calls; 1 commit; 2 pushs; 1 PR opened; checks: npm test "a; secret stuff" passed; edited config: C:\\Users\\alice\\CLAUDE.md',
      'a quiet turn',
      'T\tsecret stuff; 1 prompt',
    ] }
    const r = parseSave(raw)
    expect(r.kind === 'ok' && r.save.pendingLog).toEqual([
      'S\t2 prompts; 3 tool calls; 1 commit; 2 pushs; 1 PR opened; edited config: CLAUDE.md',
      'a quiet turn',
      'T\t1 prompt',
    ])
  })
  test('an older save\'s log lines load with check commands cut down and each line capped', () => {
    const long = `S\tedited config: ${'x'.repeat(LOG_LINE_MAX)}.md`
    const raw = { ...freshSave([1, 2, 3, 4]), pendingLog: ['S\t1 prompt; checks: make test TOKEN=abc failed, pytest -k s passed; edited config: CLAUDE.md', long] }
    const r = parseSave(raw)
    expect(r.kind === 'ok' && r.save.pendingLog).toEqual(['S\t1 prompt; checks: make test failed, pytest passed; edited config: CLAUDE.md', long.slice(0, LOG_LINE_MAX)])
  })
})
