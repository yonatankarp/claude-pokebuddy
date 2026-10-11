import { describe, expect, test } from 'claude-code/testing'
import { findSpecies } from '../hooks/data/dex'
import { POKEDEX } from '../hooks/data/pokedex.generated'

describe('generated pokedex', () => {
  test('151 species in id order', () => {
    expect(POKEDEX.length).toBe(151)
    POKEDEX.forEach((s, i) => expect(s.id).toBe(i + 1))
  })
  test('known Gen 1 facts', () => {
    const by = (id: number) => POKEDEX[id - 1]!
    expect(by(25).name).toBe('PIKACHU')
    expect(by(25).evolvesFrom).toBe(null)
    expect(by(25).evolutions).toEqual([{ kind: 'stone', to: 26, stone: 'thunder-stone' }])
    expect(by(4).evolutions).toEqual([{ kind: 'level', to: 5, level: 16 }])
    expect(by(64).evolutions).toEqual([{ kind: 'trade', to: 65 }])
    expect(by(133).evolutions.map(e => e.to).sort()).toEqual([134, 135, 136])
    expect(by(42).evolutions).toEqual([])
    expect(by(129).growth).toBe('slow')
    expect(by(35).types).toEqual(['normal'])
    expect(by(81).types).toEqual(['electric'])
  })
  test('every icon has a shiny palette of the same length', () => {
    for (const s of POKEDEX) expect(s.icon.shiny.length).toBe(s.icon.palette.length)
  })
  test('every species has a menu icon no taller than 30 pixels, with a shiny palette', () => {
    for (const s of POKEDEX) {
      expect(s.icon.shiny.length).toBe(s.icon.palette.length)
      expect(s.icon.h <= 30).toBe(true)
    }
  })
  test('dex text has no soft hyphens and keeps words whole', () => {
    for (const s of POKEDEX) expect(s.dex.includes('\u00ad')).toBe(false)
    expect(POKEDEX[24]!.dex).toContain('angered')
  })
  test('findSpecies forgives case, punctuation, spaces and the gender signs', () => {
    const id = (q: string) => findSpecies(q)?.id
    expect(id('pikachu')).toBe(25)
    expect(id('#25')).toBe(25)
    expect(id('nidoranf')).toBe(29)
    expect(id('nidoran-f')).toBe(29)
    expect(id('Nidoran♀')).toBe(29)
    expect(id('nidoran-m')).toBe(32)
    expect(id('NIDORANM')).toBe(32)
    expect(id('farfetchd')).toBe(83)
    expect(id("farfetch'd")).toBe(83)
    expect(id('mr mime')).toBe(122)
    expect(id('mr. mime')).toBe(122)
    expect(id('mrmime')).toBe(122)
    expect(id('nidoran')).toBeUndefined()
    expect(id('agumon')).toBeUndefined()
  })
})
