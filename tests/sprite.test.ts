import { describe, expect, test } from 'claude-code/testing'
import { base64Encode } from '../hooks/codec'
import { species } from '../hooks/data/dex'
import type { Sprite } from '../hooks/data/types'
import { expBar, pickScale, spriteRows, spriteSize } from '../hooks/render/sprite'
import { freshSave } from '../hooks/state'

// 2x2: top row [red, transparent], bottom row [blue, red]
const tiny: Sprite = {
  w: 2, h: 2, px: base64Encode(new Uint8Array([0x10, 0x21])),
  palette: ['', '#ff0000', '#0000ff'], shiny: ['', '#00ff00', '#0000ff'],
}

describe('sprite', () => {
  test('half-block cells: top fg, bottom bg; transparent top uses lower half block', () => {
    expect(spriteRows(tiny, false, 1)).toEqual([[
      { text: '▀', fg: '#ff0000', bg: '#0000ff' },
      { text: '▄', fg: '#ff0000' },
    ]])
  })
  test('shiny swaps the palette only', () => {
    expect(spriteRows(tiny, true, 1)[0]![0]).toEqual({ text: '▀', fg: '#00ff00', bg: '#0000ff' })
  })
  test('adjacent identical cells merge into one run', () => {
    const flat: Sprite = { w: 4, h: 2, px: base64Encode(new Uint8Array([0x11, 0x11, 0x11, 0x11])), palette: ['', '#ffffff'], shiny: ['', '#ffffff'] }
    expect(spriteRows(flat, false, 1)).toEqual([[{ text: '▀▀▀▀', fg: '#ffffff', bg: '#ffffff' }]])
  })
  test('fully transparent cells are spaces with no colour', () => {
    const empty: Sprite = { w: 1, h: 2, px: base64Encode(new Uint8Array([0x00])), palette: [''], shiny: [''] }
    expect(spriteRows(empty, false, 1)).toEqual([[{ text: ' ' }]])
  })
  test('size and scale choice', () => {
    const big = species(6).sprite
    const full = spriteSize(big, 1)
    expect(full.rows).toBe(Math.ceil(big.h / 2))
    expect(pickScale(big, 100, 200, false)).toBe(1)
    expect(pickScale(big, full.rows - 1, 200, false)).toBe(2)
    expect(pickScale(big, 100, 200, true)).toBe(2)
    expect(pickScale(big, 2, 200, false)).toBe(null)
    expect(pickScale(big, 100, 10, false)).toBe(null)
  })
  test('exp bar fills by progress through the level', () => {
    const s = freshSave([1, 2, 3, 4])
    expect(expBar(s, 10)).toBe('▱▱▱▱▱▱▱▱▱▱')
    expect(expBar({ ...s, level: 100 }, 4)).toBe('▰▰▰▰')
  })
})
