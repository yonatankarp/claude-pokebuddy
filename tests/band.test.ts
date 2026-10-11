import { describe, expect, test } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'
import { band, type BandElements, type BandView } from '../hooks/render/band'
import { species } from '../hooks/data/dex'
import { freshSave } from '../hooks/state'

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
const view = (over: Partial<BandView> = {}): BandView => ({ save, bubble: 'hello there', showFull: true, evolving: false, isFlash: false, ...over })

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
  test('evolving shows the old species name', () => {
    const out = texts(band(els, view({ evolving: true, showFull: false }), 1, 120))
    expect(out).toContain('is evolving!')
    expect(out).toContain(species(save.species).name)
  })
})
