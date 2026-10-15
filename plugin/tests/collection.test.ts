import { describe, expect, test } from 'claude-code/testing'
import { catchWild, ENCOUNTERS_PER_DAY, encountersRolled, findInBox, release, switchTo } from '../hooks/collection'
import { boxText } from '../hooks/commands'
import { species } from '../hooks/data/dex'
import { expForLevel } from '../hooks/exp'
import { typeBias } from '../hooks/skills'
import { freshSave, parseSave, type Mon, type Save } from '../hooks/state'

/** Hands out the given rolls in order. */
const dice = (...rolls: number[]) => () => rolls.shift() ?? 0.99
let n = 0
const seeds = () => [++n, 7, 7, 7]
const mon = (id: number, level = 1, extra: Partial<Mon> = {}): Mon =>
  ({ species: id, isShiny: false, personality: 'brave', nickname: null, level, exp: expForLevel(species(id).growth, level), lifetimeExp: 0, expBySource: {}, ...extra })
const cubone = (): Save => ({ ...freshSave([1, 2, 3, 4]), species: 104, level: 6, exp: expForLevel(species(104).growth, 6) })
const reparse = (s: unknown) => parseSave(JSON.parse(JSON.stringify(s)))

describe('collection', () => {
  test('each fixed check (1 in 5), commit (1 in 10) and turn of tool work (3 in 100) is a roll', () => {
    expect(encountersRolled({ greens: 2, commits: 0, usedTools: false }, dice(0.19, 0.2))).toBe(1)
    expect(encountersRolled({ greens: 0, commits: 2, usedTools: false }, dice(0.09, 0.1))).toBe(1)
    expect(encountersRolled({ greens: 0, commits: 0, usedTools: true }, dice(0.02))).toBe(1)
    expect(encountersRolled({ greens: 0, commits: 0, usedTools: true }, dice(0.03))).toBe(0)
    expect(encountersRolled({ greens: 0, commits: 0, usedTools: false }, dice(0))).toBe(0)
    expect(encountersRolled({ greens: 1, commits: 1, usedTools: true }, dice(0, 0, 0))).toBe(3)
  })

  test('over many checks the rate is about 1 in 5', () => {
    let seed = 1
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const caught = encountersRolled({ greens: 5000, commits: 0, usedTools: false }, rand)
    expect(caught > 900 && caught < 1100).toBe(true)
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

  test('skills and lifetime EXP belong to each Pokémon, not the trainer', () => {
    const s = { ...cubone(), expBySource: { green: 400 }, lifetimeExp: 400, box: [mon(92, 3, { expBySource: { commit: 25 }, lifetimeExp: 25 })] }
    const r = switchTo(s, 0)
    expect([r.save.expBySource, r.save.lifetimeExp]).toEqual([{ commit: 25 }, 25])
    expect([r.save.box[0]!.expBySource, r.save.box[0]!.lifetimeExp]).toEqual([{ green: 400 }, 400])
    const back = switchTo(r.save, 0)
    expect([back.save.expBySource, back.save.lifetimeExp]).toEqual([{ green: 400 }, 400])
    expect(catchWild(s, 1, seeds, '2026-10-11').save.box[1]).toMatchObject({ expBySource: {}, lifetimeExp: 0 })
  })

  test("the active Pokémon's skills draw wild Pokémon of their types", () => {
    const rolls = (s: Save) => {
      let bugs = 0
      for (let i = 0; i < 2000; i++) {
        const m = catchWild(s, 1, () => [i, 3, 5, 7], '2026-10-11').save.box.at(-1)!
        if (species(m.species).types.includes('bug')) bugs++
      }
      return bugs
    }
    // DEBUGGING 50 triples Bug and Poison weights; Poison takes a share of the gain, so Bug catches about double.
    const plain = rolls(cubone()), debugger_ = rolls({ ...cubone(), expBySource: { green: 2500 } })
    expect(debugger_ > plain * 1.8).toBe(true)
    expect(typeBias({ expBySource: { green: 2500 } })(species(10))).toBe(3)
    expect(typeBias({ expBySource: { green: 2500, judge: 625 } })(species(1))).toBe(4) // Bulbasaur, grass/poison: DEBUGGING and WISDOM
    expect(typeBias({ expBySource: { green: 2500 } })(species(4))).toBe(1)
  })

  test('a box entry from before per-Pokémon skills reads with none', () => {
    const old = { ...cubone(), box: [{ species: 92, isShiny: false, personality: 'brave', nickname: null, level: 1, exp: 0 }] }
    const r = reparse(old)
    expect(r.kind === 'ok' && r.save.box[0]).toMatchObject({ expBySource: {}, lifetimeExp: 0 })
    expect(reparse({ ...old, box: [mon(92, 1, { lifetimeExp: -1 })] })).toMatchObject({ kind: 'ok', save: { box: [] } })
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
