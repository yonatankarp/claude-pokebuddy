import { describe, expect, test } from 'claude-code/testing'
import { catchWild, ENCOUNTERS_PER_DAY, encountersEarned, findInBox, release, switchTo } from '../hooks/collection'
import { boxText } from '../hooks/commands'
import { species } from '../hooks/data/dex'
import { expForLevel } from '../hooks/exp'
import { freshSave, parseSave, type Mon, type Save } from '../hooks/state'

const counters = (greens: number, commits: number) => ({ greens, commits, configEdits: 0, feedRun: 0 })
let n = 0
const seeds = () => [++n, 7, 7, 7]
const mon = (id: number, level = 1, extra: Partial<Mon> = {}): Mon =>
  ({ species: id, isShiny: false, personality: 'brave', nickname: null, level, exp: expForLevel(species(id).growth, level), ...extra })
const cubone = (): Save => ({ ...freshSave([1, 2, 3, 4]), species: 104, level: 6, exp: expForLevel(species(104).growth, 6) })
const reparse = (s: unknown) => parseSave(JSON.parse(JSON.stringify(s)))

describe('collection', () => {
  test('encounters come every 5 fixed checks and every 10 commits', () => {
    expect(encountersEarned(counters(4, 9), counters(5, 9))).toBe(1)
    expect(encountersEarned(counters(4, 9), counters(5, 10))).toBe(2)
    expect(encountersEarned(counters(0, 0), counters(4, 9))).toBe(0)
    expect(encountersEarned(counters(9, 0), counters(15, 0))).toBe(2)
  })

  test('a catch boxes the Pokémon at level 1, marks it caught and toasts it', () => {
    const r = catchWild(cubone(), 1, seeds, '2026-10-11')
    expect(r.save.box).toHaveLength(1)
    const m = r.save.box[0]!
    expect(m.level).toBe(1)
    expect(r.save.caught).toContain(m.species)
    expect(r.events).toEqual([{ kind: 'caught', species: m.species, isShiny: m.isShiny }])
    expect(r.save.species).toBe(104)
    expect(reparse(r.save).kind).toBe('ok')
  })

  test('at most 3 wild Pokémon a day, and a new day starts over', () => {
    const day = catchWild(cubone(), 5, seeds, '2026-10-11')
    expect(day.save.box).toHaveLength(ENCOUNTERS_PER_DAY)
    expect(catchWild(day.save, 1, seeds, '2026-10-11').events).toEqual([])
    expect(catchWild(day.save, 1, seeds, '2026-10-12').save.box).toHaveLength(ENCOUNTERS_PER_DAY + 1)
  })

  test('switching swaps the active Pokémon with the box entry, levels and all', () => {
    const s = { ...cubone(), nickname: 'Bones', box: [mon(92, 3)] }
    const r = switchTo(s, 0)
    expect(r.error).toBeUndefined()
    expect([r.save.species, r.save.level, r.save.nickname]).toEqual([92, 3, null])
    expect(r.save.box).toEqual([mon(104, 6, { personality: s.personality, nickname: 'Bones' })])
    expect(reparse(r.save).kind).toBe('ok')
  })

  test('no switch while evolving, and none to a place the box does not have', () => {
    const evolving = { ...cubone(), level: 28, exp: expForLevel(species(104).growth, 28), evolution: { to: 105 }, box: [mon(92)] }
    expect(switchTo(evolving, 0).error).toMatch(/evolving/)
    expect(switchTo(cubone(), 0).error).toMatch(/no Pokémon/)
  })

  test('find by number, nickname or species name; release takes it from the box', () => {
    const s = { ...cubone(), box: [mon(92), mon(25, 1, { nickname: 'Sparky' })] }
    expect([findInBox(s, '2'), findInBox(s, 'sparky'), findInBox(s, 'GASTLY'), findInBox(s, '3'), findInBox(s, 'mew')]).toEqual([1, 1, 0, null, null])
    const r = release(s, 0)
    expect(r.released?.species).toBe(92)
    expect(r.save.box.map(m => m.species)).toEqual([25])
    expect(r.save.caught).toEqual(s.caught)
  })

  test('box lists the buddy, the box and the caught count', () => {
    const t = boxText({ ...cubone(), box: [mon(92, 4, { isShiny: true })], caught: [92, 104] })
    expect(t).toContain('Buddy: CUBONE  Lv 6')
    expect(t).toContain('1. GASTLY ★  Lv 4')
    expect(t).toContain('Caught 2 / 151.')
  })
})

describe('save with a box', () => {
  test('a save from before the box reads with an empty box, its Pokémon caught and no encounters', () => {
    const { box: _b, caught: _c, encounters: _e, ...old } = cubone()
    const r = reparse(old)
    expect(r.kind === 'ok' && [r.save.box, r.save.caught, r.save.encounters]).toEqual([[], [104], { date: null, count: 0 }])
  })

  test('a bad box entry is dropped and the active Pokémon and the rest are kept', () => {
    const r = reparse({ ...cubone(), box: [mon(92), { species: 999 }, mon(25, 5, { exp: 0 }), 'x', mon(1)] })
    expect(r.kind === 'ok' && r.save.species).toBe(104)
    expect(r.kind === 'ok' && r.save.box.map(m => m.species)).toEqual([92, 1])
  })

  test('caught always holds the active and boxed species, so an evolution counts', () => {
    const r = reparse({ ...cubone(), species: 105, level: 28, exp: expForLevel(species(105).growth, 28), caught: [104, 1000], box: [mon(92)] })
    expect(r.kind === 'ok' && r.save.caught).toEqual([92, 104, 105])
  })

  test('a malformed caught list or encounter counter reads as empty rather than losing the save', () => {
    const r = reparse({ ...cubone(), caught: 'all', encounters: { date: 'yesterday', count: -1 } })
    expect(r.kind === 'ok' && [r.save.caught, r.save.encounters]).toEqual([[104], { date: null, count: 0 }])
  })
})
