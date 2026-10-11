import { describe, expect, test } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'
import { band, bandArt, type BandElements, type BandView } from '../hooks/render/band'
import { species } from '../hooks/data/dex'
import { freshSave } from '../hooks/state'
import { artSize } from '../hooks/render/sprite'

type Fake = { children?: unknown } & Record<string, unknown>
const make = (type: 'Box' | 'Text') => ({ children, ...props }: Fake): RenderElement => ({
  type,
  props: props as Record<string, string | number | boolean>,
  children: [children].flat(Infinity).filter((c): c is RenderNode => typeof c === 'string' || (typeof c === 'object' && c !== null)),
}) as RenderElement
const els: BandElements = { Box: make('Box'), Text: make('Text') }

function texts(n: unknown): string {
  if (typeof n === 'string') return n
  if (n && typeof n === 'object' && 'children' in n) return ((n as { children?: unknown[] }).children ?? []).map(texts).join('')
  return ''
}

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
const kids = (n: unknown) => ((n as Node).children ?? []).filter((c): c is Node => typeof c === 'object')
const all = (n: unknown): Node[] => (typeof n === 'object' && n ? [n as Node, ...kids(n).flatMap(all)] : [])
/** Rows the fake tree takes: Text one (the band wraps its own text), a column the sum, a row the tallest, a border two more. */
function height(n: unknown): number {
  const node = n as Node
  if (node.type === 'Text') return 1
  const inner = kids(n).map(height)
  const own = node.props?.flexDirection === 'row' ? Math.max(0, ...inner) : inner.reduce((a, b) => a + b, 0)
  return own + (node.props?.borderStyle ? 2 : 0)
}
const bubbleBox = (n: unknown) => all(n).find(x => x.props?.borderStyle === 'round')

const save = freshSave([1, 2, 3, 4])
const view = (over: Partial<BandView> = {}): BandView => ({ save, bubble: 'hello there', showFull: true, evolving: false, ...over })

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
  test('the sprite at 1:1 when it fits, the icon when only that fits, beside the bubble or over the line', () => {
    const sp = species(save.species)
    const sprite = artSize(sp, 'sprite'), icon = artSize(sp, 'icon')
    expect(bandArt(view(), 100, 200)).toBe('sprite')
    expect(bandArt(view(), sprite.rows - 1, 200)).toBe('icon')
    const narrow = sprite.cols + 29
    expect(bandArt(view(), sprite.rows + 1, narrow)).toBe('sprite')
    expect(height(band(els, view(), sprite.rows + 1, narrow))).toBe(sprite.rows + 1)
    expect(bandArt(view(), icon.rows, icon.cols + 29)).toBe(null)
  })
  test('evolving shows the old species name', () => {
    const out = texts(band(els, view({ evolving: true, showFull: false }), 1, 120))
    expect(out).toContain('is evolving!')
    expect(out).toContain(species(save.species).name)
  })

  const long = 'a much longer line of speech that cannot possibly fit on one row of a forty column bubble at all'
  const spriteCols = artSize(species(save.species), 'sprite').cols
  const spriteRows = artSize(species(save.species), 'sprite').rows

  test('side by side at 120 columns: the art, a round bordered bubble with a tail, the name line under it', () => {
    const out = band(els, view(), 60, 120)
    const box = bubbleBox(out)
    expect(box).toBeDefined()
    expect(texts(box)).toContain('hello there')
    expect(texts(out)).toContain('◀')
    expect(texts(out)).toMatch(/[▀▄]/)
    expect(texts(out)).toContain(`Lv${save.level}`)
    expect(texts(out)).not.toContain('│ “')
    expect(height(out)).toBe(spriteRows)
  })
  test('too narrow for the bubble beside the art: the art, then the line with the bubble inline', () => {
    const out = band(els, view(), 60, spriteCols + 29)
    expect(bubbleBox(out)).toBeUndefined()
    expect(texts(out)).toMatch(/[▀▄]/)
    expect(texts(out)).toContain('│ “hello there”')
  })
  test('no speech yet: no bubble box, only the name line beside the art', () => {
    const out = band(els, view({ bubble: null }), 60, 120)
    expect(bubbleBox(out)).toBeUndefined()
    expect(texts(out)).toContain(`Lv${save.level}`)
  })
  test('a long line wraps inside the box, each row within the bubble width', () => {
    const box = bubbleBox(band(els, view({ bubble: long }), 60, 120))!
    const rows = kids(box).map(texts)
    expect(rows.length > 2).toBe(true)
    expect(rows.every(r => r.length <= 36)).toBe(true)
    expect(rows.join(' ')).toBe(long)
  })
  test('a long line is cut with an ellipsis when the rows are short, and the art stays', () => {
    const out = band(els, view({ bubble: long }), spriteRows, 120)
    expect(bubbleBox(out)).toBeDefined()
    expect(bandArt(view({ bubble: long }), spriteRows, 120)).toBe('sprite')
    const iconRows = artSize(species(save.species), 'icon').rows
    const short = band(els, view({ bubble: `${long} ${long} ${long}` }), iconRows, 120)
    expect(bandArt(view({ bubble: long }), iconRows, 120)).toBe('icon')
    expect(texts(bubbleBox(short))).toMatch(/…$/)
    expect(height(short)).toBe(iconRows)
  })
  test('the band is never taller than maxRows', () => {
    for (const bubble of [null, 'hello there', long]) for (const columns of [30, 60, 69, 90, 120, 200]) {
      for (let maxRows = 1; maxRows <= 40; maxRows++) {
        expect(height(band(els, view({ bubble }), maxRows, columns)) <= maxRows).toBe(true)
      }
    }
  })
  test('the bubble shows in every layout: compact, beside the sprite, under it, beside the icon, the line alone, evolving', () => {
    const icon = artSize(species(save.species), 'icon')
    const layouts: [Partial<BandView>, number, number][] = [
      [{ showFull: false }, 1, 120],
      [{}, 60, 120],
      [{}, 60, spriteCols + 29],
      [{}, icon.rows + 1, 120],
      [{}, 2, 120],
      [{ evolving: true }, 60, 120],
    ]
    for (const [over, maxRows, columns] of layouts) expect(texts(band(els, view(over), maxRows, columns))).toContain('hello there')
    expect(bandArt(view(), icon.rows + 1, 120)).toBe('icon')
  })
})
