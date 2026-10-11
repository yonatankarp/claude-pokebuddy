import { describe, expect, test } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'
import { band, type BandElements, type BandView } from '../hooks/render/band'
import { species } from '../hooks/data/dex'
import { freshSave } from '../hooks/state'
import { spriteSize } from '../hooks/render/sprite'

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
const view = (over: Partial<BandView> = {}): BandView => ({ save, bubble: 'hello there', showFull: true, evolving: false, frame: 0, ...over })

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
    expect(rows(100)).toBe(spriteSize(sp.sprite).rows)
    expect(rows(spriteSize(sp.sprite).rows)).toBe(spriteSize(sp.icon).rows)
  })
  test('the idle frame changes the art, not the band height; compact never animates', () => {
    const draw = (frame: 0 | 1, showFull = true) => band(els, view({ frame, showFull }), 100, 200) as { children?: unknown[] }
    expect(draw(1).children!.length).toBe(draw(0).children!.length)
    expect(texts(draw(1))).not.toBe(texts(draw(0)))
    expect(texts(draw(1, false))).toBe(texts(draw(0, false)))
  })
  test('evolving shows the old species name', () => {
    const out = texts(band(els, view({ evolving: true, showFull: false }), 1, 120))
    expect(out).toContain('is evolving!')
    expect(out).toContain(species(save.species).name)
  })
})
