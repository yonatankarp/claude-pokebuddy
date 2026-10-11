import { describe, expect, test } from 'claude-code/testing'
import { base64Encode } from '../hooks/codec'
import { species } from '../hooks/data/dex'
import type { Sprite } from '../hooks/data/types'
import { artSize, expBar, fitArt, frameRows, spriteRows, spriteSize, type Run } from '../hooks/render/sprite'
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
  test('the fit check is two pixel rows per text row, one column per pixel', () => {
    expect(spriteSize(tiny)).toEqual({ rows: 1, cols: 2 })
    expect(spriteSize({ ...tiny, h: 3 }).rows).toBe(2)
  })
  test('animation frames draw in the sprite palette, shiny too, and differ where the pose does', () => {
    const sp = species(25)
    const f0 = frameRows(sp, 0, false), f5 = frameRows(sp, 5, false)
    expect(f0.length).toBe(Math.ceil(sp.frames.h / 2))
    expect(f5.length).toBe(f0.length)
    expect(JSON.stringify(f5)).not.toBe(JSON.stringify(f0))
    const colours = (rows: Run[][]) => new Set(rows.flat().flatMap(r => [r.fg, r.bg]).filter(Boolean))
    expect([...colours(f0)].every(c => sp.sprite.palette.includes(c!))).toBe(true)
    expect([...colours(frameRows(sp, 0, true))].every(c => sp.sprite.shiny.includes(c!))).toBe(true)
  })
  test('art: the animated sprite at 1:1 when its frames fit, else the icon, else none', () => {
    const sp = species(6)
    const full = artSize(sp, 'sprite'), icon = artSize(sp, 'icon')
    expect(full).toEqual(spriteSize(sp.frames))
    expect(icon).toEqual(spriteSize(sp.icon))
    expect(icon.rows < full.rows && icon.cols < full.cols).toBe(true)
    expect(fitArt(sp, full.rows, full.cols)).toBe('sprite')
    expect(fitArt(sp, full.rows - 1, 200)).toBe('icon')
    expect(fitArt(sp, 100, full.cols - 1)).toBe('icon')
    expect(fitArt(sp, icon.rows, icon.cols)).toBe('icon')
    expect(fitArt(sp, icon.rows - 1, 200)).toBe(null)
    expect(fitArt(sp, 100, icon.cols - 1)).toBe(null)
  })
  test('exp bar fills by progress through the level', () => {
    const s = freshSave([1, 2, 3, 4])
    expect(expBar(s, 10)).toBe('▱▱▱▱▱▱▱▱▱▱')
    expect(expBar({ ...s, level: 100 }, 4)).toBe('▰▰▰▰')
  })
})
