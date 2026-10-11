import { describe, expect, test } from 'claude-code/testing'
import { base64Encode } from '../hooks/codec'
import { species } from '../hooks/data/dex'
import type { Sprite } from '../hooks/data/types'
import { artSize, expBar, fitArt, spriteRows, spriteSize, spriteSvg } from '../hooks/render/sprite'
import { freshSave } from '../hooks/state'

// 2x2: top row [red, transparent], bottom row [blue, red]
const tiny: Sprite = {
  w: 2, h: 2, px: base64Encode(new Uint8Array([0x10, 0x21])),
  palette: ['', '#ff0000', '#0000ff'], shiny: ['', '#00ff00', '#0000ff'],
}

describe('sprite', () => {
  test('half-block cells: top fg, bottom bg; transparent top uses lower half block', () => {
    expect(spriteRows(tiny, false)).toEqual([[
      { text: '▀', fg: '#ff0000', bg: '#0000ff' },
      { text: '▄', fg: '#ff0000' },
    ]])
  })
  test('svg: one rect per coloured run, transparent pixels skipped', () => {
    const svg = spriteSvg(tiny, false)
    expect(svg).toContain('viewBox="0 0 2 2"')
    expect(svg.match(/<rect /g)?.length).toBe(3)
    expect(svg).toContain('<rect x="0" y="0" width="1" height="1" fill="#ff0000"/>')
    expect(spriteSvg(tiny, true)).toContain('fill="#00ff00"')
  })
  test('shiny swaps the palette only', () => {
    expect(spriteRows(tiny, true)[0]![0]).toEqual({ text: '▀', fg: '#00ff00', bg: '#0000ff' })
  })
  test('adjacent identical cells merge into one run', () => {
    const flat: Sprite = { w: 4, h: 2, px: base64Encode(new Uint8Array([0x11, 0x11, 0x11, 0x11])), palette: ['', '#ffffff'], shiny: ['', '#ffffff'] }
    expect(spriteRows(flat, false)).toEqual([[{ text: '▀▀▀▀', fg: '#ffffff', bg: '#ffffff' }]])
  })
  test('fully transparent cells are spaces with no colour', () => {
    const empty: Sprite = { w: 1, h: 2, px: base64Encode(new Uint8Array([0x00])), palette: [''], shiny: [''] }
    expect(spriteRows(empty, false)).toEqual([[{ text: ' ' }]])
  })
  test('the fit check is two pixel rows per text row, one column per pixel', () => {
    expect(spriteSize(tiny)).toEqual({ rows: 1, cols: 2 })
    expect(spriteSize({ ...tiny, h: 3 }).rows).toBe(2)
  })
  test('art: the icon at 1:1 when it fits, else none', () => {
    const sp = species(6)
    const icon = artSize(sp)
    expect(icon).toEqual(spriteSize(sp.icon))
    expect(fitArt(sp, 100, 200)).toBe(true)
    expect(fitArt(sp, icon.rows, icon.cols)).toBe(true)
    expect(fitArt(sp, icon.rows - 1, 200)).toBe(false)
    expect(fitArt(sp, 100, icon.cols - 1)).toBe(false)
  })
  test('exp bar fills by progress through the level', () => {
    const s = freshSave([1, 2, 3, 4])
    expect(expBar(s, 10)).toBe('▱▱▱▱▱▱▱▱▱▱')
    expect(expBar({ ...s, level: 100 }, 4)).toBe('▰▰▰▰')
  })
})
