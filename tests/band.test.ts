import { describe, expect, test } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'
import { band, bandArt, type BandElements, type BandView } from '../hooks/render/band'
import { species } from '../hooks/data/dex'
import { freshSave } from '../hooks/state'
import { artSize } from '../hooks/render/sprite'
import { IDLE_REST_MS, TICK_MS } from '../hooks/config'

type Fake = { children?: unknown }
const make = (type: 'Box' | 'Text') => (props: Fake): RenderElement => ({
  type,
  children: [props.children].flat(Infinity).filter((c): c is RenderNode => typeof c === 'string' || (typeof c === 'object' && c !== null)),
})
const els: BandElements = { Box: make('Box'), Text: make('Text') }

function texts(n: unknown): string {
  if (typeof n === 'string') return n
  if (n && typeof n === 'object' && 'children' in n) return ((n as { children?: unknown[] }).children ?? []).map(texts).join('')
  return ''
}

const save = freshSave([1, 2, 3, 4])
const view = (over: Partial<BandView> = {}): BandView => ({ save, bubble: 'hello there', showFull: true, evolving: false, now: 0, flashStart: null, ...over })

describe('band', () => {
  test('maxRows 1 draws the single line without a sprite', () => {
    const out = band(els, view(), 1, 120)
    expect(texts(out)).toContain(`Lv${save.level}`)
    expect(texts(out)).not.toContain('▀')
    expect(texts(out)).not.toContain('▄')
  })
  test('bubble hidden below the compact width, shown above it', () => {
    expect(texts(band(els, view({ showFull: false }), 1, 40))).not.toContain('hello there')
    expect(texts(band(els, view({ showFull: false }), 1, 120))).toContain('hello there')
  })
  test('showFull with room draws sprite rows above the line', () => {
    expect(texts(band(els, view(), 100, 200))).toMatch(/[▀▄]/)
  })
  test('the sprite at 1:1 when it fits, the icon when only that fits', () => {
    const sp = species(save.species)
    const rows = (maxRows: number) => ((band(els, view(), maxRows, 200) as { children?: unknown[] }).children ?? []).length - 1
    expect(rows(100)).toBe(artSize(sp, 'sprite').rows)
    expect(rows(artSize(sp, 'sprite').rows)).toBe(artSize(sp, 'icon').rows)
  })
  test('the sprite animates between two clock times; the icon and the compact line stay still', () => {
    const pika = { ...save, species: 25 }
    const sp = species(25)
    // Pikachu's idle opens on frame 0 for one step, then frame 5.
    const cycle = sp.anim.idle.reduce((ms, s) => ms + s.ticks * TICK_MS, 0) + IDLE_REST_MS
    const t0 = 40 * cycle + 2, t1 = 40 * cycle + (sp.anim.idle[0]!.ticks + 1) * TICK_MS
    const draw = (now: number, maxRows: number, showFull = true) => band(els, view({ save: pika, now, showFull }), maxRows, 200)
    const sprite = artSize(sp, 'sprite').rows + 1, icon = artSize(sp, 'icon').rows + 1
    expect(bandArt(view({ save: pika }), sprite, 200)).toBe('sprite')
    expect(texts(draw(t1, sprite))).not.toBe(texts(draw(t0, sprite)))
    expect((draw(t1, sprite) as { children?: unknown[] }).children!.length).toBe((draw(t0, sprite) as { children?: unknown[] }).children!.length)
    expect(bandArt(view({ save: pika }), icon, 200)).toBe('icon')
    expect(texts(draw(t1, icon))).toBe(texts(draw(t0, icon)))
    expect(bandArt(view({ save: pika, showFull: false }), sprite, 200)).toBe(null)
    expect(texts(draw(t1, sprite, false))).toBe(texts(draw(t0, sprite, false)))
  })
  test('evolving shows the old species name', () => {
    const out = texts(band(els, view({ evolving: true, showFull: false }), 1, 120))
    expect(out).toContain('is evolving!')
    expect(out).toContain(species(save.species).name)
  })
})
