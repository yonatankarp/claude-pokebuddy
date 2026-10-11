import { describe, expect, test } from 'claude-code/testing'
import { species } from '../hooks/data/dex'
import { expForLevel } from '../hooks/exp'
import { applyExp, applyTurn, cancelEvolution, feed, finishEvolution, useStone } from '../hooks/game'
import { localTime, previousDate } from '../hooks/localtime'
import { freshSave, type Save } from '../hooks/state'
import { emptyTally, scoreTally } from '../hooks/tally'

const as = (id: number, level: number, extra: Partial<Save> = {}): Save => {
  const s = freshSave([1, 2, 3, 4])
  return { ...s, species: id, level, exp: expForLevel(species(id).growth, level), ...extra }
}
const day = { date: '2026-10-11', hour: 14 }

describe('game', () => {
  test('EXP crossing a level emits a level event, and an evolution level starts evolving', () => {
    const s = as(4, 15) // Charmander, medium-slow
    const r = applyExp(s, { commit: expForLevel(species(4).growth, 16) - s.exp })
    expect(r.save.level).toBe(16)
    expect(r.events).toEqual([{ kind: 'level', level: 16 }, { kind: 'evolving', from: 4, to: 5 }])
    expect(r.save.evolution).toEqual({ to: 5 })
    const done = finishEvolution(r.save)
    expect(done.save.species).toBe(5)
    expect(done.events).toEqual([{ kind: 'evolved', from: 4, to: 5 }])
  })
  test('cancel holds for this level and retries at the next', () => {
    const r = applyExp(as(4, 15), { commit: 10000 })
    const c = cancelEvolution(r.save)
    expect(c.cancelled).toBe(true)
    expect(c.save.evolution).toBe(null)
    expect(c.save.cancelledAtLevel).toBe(c.save.level)
    const again = applyExp(c.save, { commit: expForLevel(species(4).growth, c.save.level + 1) - c.save.exp })
    expect(again.events.some(e => e.kind === 'evolving')).toBe(true)
  })
  test('level 100 caps; lifetime keeps growing', () => {
    const s = as(4, 100)
    const r = applyExp(s, { tool: 50 })
    expect(r.save.level).toBe(100)
    expect(r.save.exp).toBe(s.exp)
    expect(r.save.lifetimeExp).toBe(s.lifetimeExp + 50)
  })
  test('expBySource accumulates', () => {
    const r = applyExp(as(4, 10), { tool: 6, prompt: 10 })
    expect(r.save.expBySource.tool).toBe(6)
    expect(r.save.expBySource.prompt).toBe(10)
  })
  test('ten commits across turns earns a Fire Stone', () => {
    let s = as(25, 10, { counters: { greens: 0, commits: 9, configEdits: 0, feedRun: 0 } })
    const r = applyTurn(s, scoreTally({ ...emptyTally(), signals: [{ kind: 'commit' }] }, {}), day)
    expect(r.events).toContainEqual({ kind: 'stone', stone: 'fire-stone' })
    expect(r.save.bag['fire-stone']).toBe(1)
  })
  test('Moon Stone once per night between 0 and 4', () => {
    const night = { date: '2026-10-12', hour: 2 }
    const r1 = applyTurn(as(35, 10), scoreTally(emptyTally(), {}), night)
    expect(r1.save.bag['moon-stone']).toBe(1)
    const r2 = applyTurn(r1.save, scoreTally(emptyTally(), {}), night)
    expect(r2.save.bag['moon-stone']).toBe(1)
  })
  test('trade evolution on a push at 36+', () => {
    const r = applyTurn(as(64, 36), scoreTally({ ...emptyTally(), signals: [{ kind: 'push' }] }, {}), day)
    expect(r.save.species).toBe(65)
    expect(r.events).toContainEqual({ kind: 'evolved', from: 64, to: 65 })
  })
  test('feed once a day; streak and Leaf Stone', () => {
    let s = as(1, 10)
    const f1 = feed(s, day)
    expect(f1.fed).toBe(true)
    expect(f1.save.level).toBe(11)
    expect(feed(f1.save, day).fed).toBe(false)
    let cur = f1.save
    let date = day.date
    for (let i = 0; i < 6; i++) {
      date = nextDate(date)
      cur = feed(cur, { date, hour: 9 }).save
    }
    expect(cur.counters.feedRun).toBe(7)
    expect(cur.bag['leaf-stone']).toBe(1)
    const skipped = feed(cur, { date: nextDate(nextDate(date)), hour: 9 })
    expect(skipped.save.counters.feedRun).toBe(1)
  })
  test('useStone evolves when allowed and explains when not', () => {
    const s = as(133, 20, { bag: { 'fire-stone': 1 } })
    const ok = useStone(s, 'fire-stone')
    expect(ok.save.species).toBe(136)
    expect(ok.save.bag['fire-stone']).toBe(0)
    expect(useStone(s, 'water-stone').error).toBe('You have no WATER STONE.')
    expect(useStone(as(4, 20, { bag: { 'fire-stone': 1 } }), 'fire-stone').error).toBe('CHARMANDER cannot use a FIRE STONE.')
  })
  test('previousDate crosses months and years', () => {
    expect(previousDate('2026-03-01')).toBe('2026-02-28')
    expect(previousDate('2026-01-01')).toBe('2025-12-31')
  })
  test('localTime with an offset', () => {
    const t = Date.UTC(2026, 9, 11, 23, 30)
    expect(localTime(t, 120)).toEqual({ date: '2026-10-12', hour: 1 })
    expect(localTime(t, -300)).toEqual({ date: '2026-10-11', hour: 18 })
  })
})

function nextDate(d: string): string {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10)
}
