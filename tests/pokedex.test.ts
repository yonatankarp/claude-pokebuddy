import { describe, expect, test } from 'claude-code/testing'
import { base64Decode, rleDecode } from '../hooks/codec'
import { findSpecies, POKEDEX } from '../hooks/data/dex'

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
  test('every species has a menu icon no taller than 30 pixels, with a shiny palette', () => {
    for (const s of POKEDEX) {
      expect(s.icon.shiny.length).toBe(s.icon.palette.length)
      expect(s.icon.h <= 30).toBe(true)
    }
  })
  test('every species has Crystal frames of one size, frame 0 the sprite in the same palette', () => {
    for (const s of POKEDEX) {
      expect(s.frames.px.length >= 1).toBe(true)
      for (const px of s.frames.px) {
        const indexes = rleDecode(base64Decode(px))
        expect(indexes.length).toBe(s.frames.w * s.frames.h)
        expect(indexes.every(k => k < s.sprite.palette.length)).toBe(true)
      }
      const f0 = rleDecode(base64Decode(s.frames.px[0]!))
      const opaque = f0.filter(k => k !== 0).length
      const sprite = Array.from(base64Decode(s.sprite.px)).flatMap(b => [b >> 4, b & 15]).slice(0, s.sprite.w * s.sprite.h)
      expect(opaque).toBe(sprite.filter(k => k !== 0).length)
    }
  })
  test('every animation step shows a frame that exists, for at least one tick', () => {
    for (const s of POKEDEX) {
      expect(s.anim.idle.length >= 1).toBe(true)
      for (const step of [...s.anim.intro, ...s.anim.idle]) {
        expect(step.frame < s.frames.px.length).toBe(true)
        expect(step.ticks >= 1).toBe(true)
      }
    }
  })
  test('Pikachu\'s idle unrolls pokecrystal\'s anim_idle.asm', () => {
    expect(POKEDEX[24]!.anim.idle.map(s => s.frame)).toEqual([0, 5, 0, 5, 0, 5, 0, 4, 0, 4])
    expect(POKEDEX[24]!.anim.idle.every(s => s.ticks === 5)).toBe(true)
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
