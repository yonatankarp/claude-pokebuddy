import { describe, expect, test } from 'claude-code/testing'
import { configSignal, type Signal } from '../hooks/signals'
import { emptyTally, scoreTally, TURN_CAP, withoutReds, type Tally } from '../hooks/tally'

const tool: Signal = { kind: 'tool' }

describe('scoreTally', () => {
  test('prompt, tools and active windows', () => {
    const t = { ...emptyTally(), prompts: 1, activeWindows: 2, signals: [tool, tool, tool] }
    const r = scoreTally(t, {})
    expect(r.bySource).toEqual({ prompt: 10, tool: 6, active: 10 })
    expect(r.total).toBe(26)
  })
  test('tool EXP is capped at 40 per turn', () => {
    const t = { ...emptyTally(), signals: Array.from({ length: 300 }, () => tool) }
    expect(scoreTally(t, {}).bySource.tool).toBe(40)
  })
  test('config edits count once per file per turn', () => {
    const t = { ...emptyTally(), signals: [
      configSignal('/a/CLAUDE.md'), configSignal('/a/CLAUDE.md'), configSignal('/b/CLAUDE.md'),
    ] as Signal[] }
    const r = scoreTally(t, {})
    expect(r.bySource.config).toBe(50)
    expect(r.configEdits).toBe(2)
  })
  test('green after red needs a failure of the same key first, across turns', () => {
    const fail = { ...emptyTally(), signals: [{ kind: 'check', key: 'npm test', ok: false }] as Signal[] }
    const r1 = scoreTally(fail, {})
    expect(r1.greens).toBe(0)
    expect(r1.checks).toEqual({ 'npm test': true })
    const pass = { ...emptyTally(), signals: [{ kind: 'check', key: 'npm test', ok: true }, { kind: 'check', key: 'npm test', ok: true }] as Signal[] }
    const r2 = scoreTally(pass, r1.checks)
    expect(r2.greens).toBe(1)
    expect(r2.bySource.green).toBe(40)
    expect(r2.checks).toEqual({})
  })
  test('a pass with no prior failure earns nothing', () => {
    const pass = { ...emptyTally(), signals: [{ kind: 'check', key: 'npm test', ok: true }] as Signal[] }
    expect(scoreTally(pass, {}).greens).toBe(0)
  })
  test('commits, pushes and PRs', () => {
    const t = { ...emptyTally(), signals: [{ kind: 'commit' }, { kind: 'push' }, { kind: 'pr' }] as Signal[] }
    const r = scoreTally(t, {})
    expect(r.bySource).toEqual({ commit: 30, push: 100 })
    expect(r.commits).toBe(1)
    expect(r.pushes).toBe(2)
  })
  test('checks keep the 100 most recent failing keys', () => {
    const old = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, true]))
    const t = { ...emptyTally(), signals: [{ kind: 'check', key: 'k0', ok: false }, { kind: 'check', key: 'new', ok: false }] as Signal[] }
    const r = scoreTally(t, old)
    expect(Object.keys(r.checks)).toHaveLength(100)
    expect(r.checks.k1).toBeUndefined()
    expect(r.checks.k0).toBe(true)
    expect(r.checks.new).toBe(true)
  })
  test('withoutReds drops the failed checks only', () => {
    const t: Tally = { prompts: 1, activeWindows: 1, signals: [{ kind: 'tool' }, { kind: 'check', key: 'npm test', ok: false }, { kind: 'check', key: 'tsc', ok: true }, { kind: 'commit' }] }
    expect(withoutReds(t)).toEqual({ ...t, signals: [{ kind: 'tool' }, { kind: 'check', key: 'tsc', ok: true }, { kind: 'commit' }] })
  })
  test('one turn counts at most 3 config files, 3 commits, 2 pushes or PRs and 3 greens, in EXP and counters', () => {
    const many = (n: number, f: (i: number) => Signal) => Array.from({ length: n }, (_, i) => f(i))
    const reds = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`c${i}`, true]))
    const t = { ...emptyTally(), signals: [
      ...many(5, i => configSignal(`/r/.claude/agents/a${i}.md`)),
      ...many(5, () => ({ kind: 'commit' })),
      ...many(2, () => ({ kind: 'push' })), { kind: 'pr' },
      ...many(5, i => ({ kind: 'check', key: `c${i}`, ok: true })),
    ] as Signal[] }
    const r = scoreTally(t, reds)
    expect([r.configEdits, r.commits, r.pushes, r.greens]).toEqual([TURN_CAP.config, TURN_CAP.commit, TURN_CAP.push, TURN_CAP.green])
    expect(r.bySource).toEqual({ config: 75, commit: 90, push: 100, green: 120 })
    expect(r.checks).toEqual({})
  })
})
