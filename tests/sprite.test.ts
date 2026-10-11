import { describe, expect, test } from 'claude-code/testing'
import { base64Encode } from '../hooks/codec'
import { species } from '../hooks/data/dex'
import type { Sprite } from '../hooks/data/types'
import { expBar, pickArt, spriteRows, spriteSize } from '../hooks/render/sprite'
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
  test('art: the sprite at 1:1 when it fits above the line, else the icon, else none', () => {
    const sp = species(6)
    const full = spriteSize(sp.sprite), icon = spriteSize(sp.icon)
    expect(full.rows).toBe(Math.ceil(sp.sprite.h / 2))
    expect(full.cols).toBe(sp.sprite.w)
    expect(icon.rows < full.rows && icon.cols < full.cols).toBe(true)
    expect(pickArt(sp, full.rows + 1, full.cols)).toBe('sprite')
    expect(pickArt(sp, full.rows, 200)).toBe('icon')
    expect(pickArt(sp, 100, full.cols - 1)).toBe('icon')
    expect(pickArt(sp, icon.rows + 1, icon.cols)).toBe('icon')
    expect(pickArt(sp, icon.rows, 200)).toBe(null)
    expect(pickArt(sp, 100, icon.cols - 1)).toBe(null)
  })
  test('exp bar fills by progress through the level', () => {
    const s = freshSave([1, 2, 3, 4])
    expect(expBar(s, 10)).toBe('▱▱▱▱▱▱▱▱▱▱')
    expect(expBar({ ...s, level: 100 }, 4)).toBe('▰▰▰▰')
  })
})
