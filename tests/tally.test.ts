import { describe, expect, test } from 'claude-code/testing'
import type { Signal } from '../hooks/signals'
import { emptyTally, scoreTally } from '../hooks/tally'

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
      { kind: 'config', path: '/a/CLAUDE.md' }, { kind: 'config', path: '/a/CLAUDE.md' }, { kind: 'config', path: '/b/CLAUDE.md' },
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
})
