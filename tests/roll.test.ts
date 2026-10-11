import { describe, expect, test } from 'claude-code/testing'
import { POKEDEX } from '../hooks/data/pokedex.generated'
import { findSpecies } from '../hooks/data/dex'
import { LEGENDARIES, rollFrom, rollWeight } from '../hooks/roll'
import { sfc32 } from '../hooks/rng'

describe('roll', () => {
  test('same seed, same roll', () => {
    expect(rollFrom([1, 2, 3, 4])).toEqual(rollFrom([1, 2, 3, 4]))
  })
  test('only base forms are rollable', () => {
    for (const s of POKEDEX) {
      if (s.evolvesFrom !== null) expect(rollWeight(s)).toBe(0)
    }
    expect(rollWeight(POKEDEX[24]!)).toBe(1) // Pikachu
    expect(rollWeight(POKEDEX[130]!)).toBe(0.33) // Lapras
    expect(rollWeight(POKEDEX[149]!)).toBe(0.02) // Mewtwo
  })
  test('rates over 100k seeds are within tolerance', () => {
    const gen = sfc32([42, 42, 42, 42])
    const seed = () => [0, 0, 0, 0].map(() => Math.floor(gen() * 2 ** 32))
    let legendary = 0, shiny = 0, single = 0
    const N = 100000
    for (let i = 0; i < N; i++) {
      const r = rollFrom(seed())
      const s = POKEDEX[r.species - 1]!
      expect(s.evolvesFrom).toBe(null)
      if (LEGENDARIES.has(r.species)) legendary++
      else if (s.evolutions.length === 0) single++
      if (r.isShiny) shiny++
    }
    const total = POKEDEX.reduce((a, s) => a + rollWeight(s), 0)
    const singleWeight = POKEDEX.filter(s => rollWeight(s) === 0.33).length * 0.33
    expect(Math.abs(legendary / N - 0.1 / total) < 0.002).toBe(true)
    expect(Math.abs(single / N - singleWeight / total) < 0.01).toBe(true)
    expect(Math.abs(shiny / N - 1 / 512) < 0.0008).toBe(true)
  })
  test('findSpecies by name and number', () => {
    expect(findSpecies('pikachu')?.id).toBe(25)
    expect(findSpecies('#6')?.name).toBe('CHARIZARD')
    expect(findSpecies('151')?.name).toBe('MEW')
    expect(findSpecies('agumon')).toBe(undefined)
    expect(findSpecies('152')).toBe(undefined)
  })
})
