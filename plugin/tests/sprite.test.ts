import { describe, expect, test } from 'claude-code/testing'
import { base64Encode } from '../hooks/codec'
import { species } from '../hooks/data/dex'
import type { Idle, Sprite } from '../hooks/data/types'
import { artSize, expBar, fitArt, IDLE_FIT, idleScale, idleSvg, pixelArtSvg, spriteRows, spriteSize } from '../hooks/render/sprite'
import { POKEDEX } from '../hooks/data/pokedex.generated'
import { freshSave } from '../hooks/state'

// 2x2: top row [red, transparent], bottom row [blue, red]
const tiny: Sprite = {
  w: 2, h: 2, px: base64Encode(new Uint8Array([0x10, 0x21])),
  palette: ['', '#ff0000', '#0000ff'], shiny: ['', '#00ff00', '#0000ff'],
}

describe('sprite', () => {
  test('pixelArtSvg draws a rect per same-colour run, sized to the widest row, and leaves unknown characters clear', () => {
    const svg = pixelArtSvg(['aab', '.a'], { a: '#111', b: '#222' })
    expect(svg).toContain('viewBox="0 0 3 2"')
    expect(svg).toContain('<rect x="0" y="0" width="2" height="1" fill="#111"/><rect x="2" y="0" width="1" height="1" fill="#222"/>')
    expect(svg).toContain('<rect x="1" y="1" width="1" height="1" fill="#111"/>')
    expect(svg.match(/<rect/g)).toHaveLength(3)
  })

  test('half-block cells: top fg, bottom bg; transparent top uses lower half block', () => {
    expect(spriteRows(tiny, false)).toEqual([[
      { text: '▀', fg: '#ff0000', bg: '#0000ff' },
      { text: '▄', fg: '#ff0000' },
    ]])
  })
  test('the idle draws each frame as a path per colour, the first shown, each for its own share of the loop', () => {
    // Two 2x2 frames: [red, clear / blue, red] for 30 sixtieths, then all red for 30.
    const idle: Idle = {
      w: 2, h: 2, frames: [base64Encode(new Uint8Array([0x10, 0x21])), base64Encode(new Uint8Array([0x11, 0x11]))],
      durations: [30, 30], palette: ['', '#ff0000', '#0000ff'], shiny: ['', '#00ff00', '#0000ff'],
    }
    const svg = idleSvg(idle, false, 0)
    expect(svg).toContain('viewBox="0 0 2 2"')
    expect(svg).toContain('<g visibility="visible"><animate attributeName="visibility" calcMode="discrete" values="visible;hidden" keyTimes="0;0.5" dur="1s"')
    expect(svg).toContain('<path fill="#ff0000" d="M0 0h1v1h-1zM1 1h1v1h-1z"/><path fill="#0000ff" d="M0 1h1v1h-1z"/>')
    expect(svg).toContain('values="hidden;visible;hidden" keyTimes="0;0.5;1"')
    expect(svg).toContain('<path fill="#ff0000" d="M0 0h2v1h-2zM0 1h2v1h-2z"/>')
    expect(idleSvg(idle, true, 0)).toContain('fill="#00ff00"')
    expect(idleSvg(idle, false, 1).match(/begin="[^"]+"/)?.[0]).not.toBe(idleSvg(idle, false, 2).match(/begin="[^"]+"/)?.[0])
  })
  test('every idle fits the Svg limit, a frame per duration, and draws no taller than a full-scale one', () => {
    for (const sp of POKEDEX) {
      const { idle } = sp
      expect(idle.frames).toHaveLength(idle.durations.length)
      expect(idle.palette.length).toBeLessThanOrEqual(16)
      expect(idleSvg(idle, true, sp.id).length).toBeLessThan(131072)
      expect(idle.h * idleScale(idle, 6)).toBeLessThanOrEqual(IDLE_FIT * 6)
    }
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
