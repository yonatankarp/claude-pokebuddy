import { describe, expect, test } from 'claude-code/testing'
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
  test('every sprite has a shiny palette of the same length', () => {
    for (const s of POKEDEX) expect(s.sprite.shiny.length).toBe(s.sprite.palette.length)
  })
})
