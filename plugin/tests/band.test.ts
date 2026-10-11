import { describe, expect, test } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'
import { band, bandLayout, cellWidth, type BandElements, type BandView } from '../hooks/render/band'
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
const hasArt = (...a: Parameters<typeof bandLayout>) => bandLayout(...a) !== null
const view = (over: Partial<BandView> = {}): BandView => ({ save, bubble: 'hello there', showFull: true, evolving: false, ...over })

describe('band', () => {
  test('maxRows 1 draws the single line without art', () => {
    const out = band(els, view(), 1, 120, true)
    expect(texts(out)).toContain(`Lv${save.level}`)
    expect(texts(out)).not.toContain('▀')
    expect(texts(out)).not.toContain('▄')
  })
  test('the inline bubble is cut to the room left on the line, and dropped under 12 columns of room', () => {
    const chatty = view({ showFull: false, bubble: 'a line of speech too long for forty columns' })
    const at40 = texts(band(els, chatty, 1, 40, true))
    expect(at40).toContain('│ “a line')
    expect(at40).toMatch(/…$/)
    expect(at40.length <= 40).toBe(true)
    expect(texts(band(els, view({ showFull: false }), 1, 120, true))).toContain('“hello there”')
    expect(texts(band(els, chatty, 1, 30, true))).not.toContain('│')
  })
  test('showFull with room draws the icon rows above the line', () => {
    expect(texts(band(els, view(), 100, 200, true))).toMatch(/[▀▄]/)
  })
  test('the icon at 1:1 when it fits, beside the bubble or over the line, else the line alone', () => {
    const icon = artSize(species(save.species))
    expect(hasArt(view(), 100, 200, true)).toBe(true)
    expect(hasArt(view(), icon.rows + 1, icon.cols, true)).toBe(true)
    expect(height(band(els, view(), icon.rows + 1, icon.cols + 29, true))).toBe(icon.rows + 1)
    expect(hasArt(view(), icon.rows, icon.cols + 29, true)).toBe(false)
    expect(hasArt(view(), 100, icon.cols - 1, true)).toBe(false)
    expect(hasArt(view({ showFull: false }), 100, 200, true)).toBe(false)
  })
  test('evolving shows the old species name', () => {
    const out = texts(band(els, view({ evolving: true, showFull: false }), 1, 120, true))
    expect(out).toContain('is evolving!')
    expect(out).toContain(species(save.species).name)
  })

  const long = 'a much longer line of speech that cannot possibly fit on one row of a forty column bubble at all'
  const iconCols = artSize(species(save.species)).cols
  const iconRows = artSize(species(save.species)).rows

  test('side by side at 120 columns: the art, a round bordered bubble with a tail, the name line under it', () => {
    const out = band(els, view(), 60, 120, true)
    const box = bubbleBox(out)
    expect(box).toBeDefined()
    expect(texts(box)).toContain('hello there')
    expect(texts(out)).toContain('◀')
    expect(texts(out)).toMatch(/[▀▄]/)
    expect(texts(out)).toContain(`Lv${save.level}`)
    expect(texts(out)).not.toContain('│ “')
    expect(height(out)).toBe(iconRows)
  })
  test('too narrow for the bubble beside the art: the art, then the line with the bubble inline', () => {
    const out = band(els, view(), 60, iconCols + 29, true)
    expect(bubbleBox(out)).toBeUndefined()
    expect(texts(out)).toMatch(/[▀▄]/)
    expect(texts(out)).toContain('│ “hello there”')
  })
  test('no speech yet: no bubble box, only the name line beside the art', () => {
    const out = band(els, view({ bubble: null }), 60, 120, true)
    expect(bubbleBox(out)).toBeUndefined()
    expect(texts(out)).toContain(`Lv${save.level}`)
  })
  test('a long line wraps inside the box, each row within the bubble width', () => {
    const box = bubbleBox(band(els, view({ bubble: long }), 60, 120, true))!
    const rows = kids(box).map(texts)
    expect(rows.length > 2).toBe(true)
    expect(rows.every(r => r.length <= 36)).toBe(true)
    expect(rows.join(' ')).toBe(long)
  })
  test('a long line is cut with an ellipsis when the rows are short, and the art stays', () => {
    const out = band(els, view({ bubble: long }), iconRows, 120, true)
    expect(bubbleBox(out)).toBeDefined()
    expect(hasArt(view({ bubble: long }), iconRows, 120, true)).toBe(true)
    const short = band(els, view({ bubble: `${long} ${long} ${long}` }), iconRows, 120, true)
    expect(texts(bubbleBox(short))).toMatch(/…$/)
    expect(height(short)).toBe(iconRows)
  })
  test('the band is never taller than maxRows', () => {
    for (const bubble of [null, 'hello there', long]) for (const columns of [30, 60, 69, 90, 120, 200]) {
      for (let maxRows = 1; maxRows <= 40; maxRows++) {
        expect(height(band(els, view({ bubble }), maxRows, columns, true)) <= maxRows).toBe(true)
      }
    }
  })
  test('the bubble shows in every layout: compact, beside the icon, under it, the line alone, evolving', () => {
    const icon = artSize(species(save.species))
    const layouts: [Partial<BandView>, number, number][] = [
      [{ showFull: false }, 1, 120],
      [{}, 60, 120],
      [{}, 60, iconCols + 29],
      [{}, icon.rows + 1, 120],
      [{}, 2, 120],
      [{ evolving: true }, 60, 120],
    ]
    for (const [over, maxRows, columns] of layouts) expect(texts(band(els, view(over), maxRows, columns, true))).toContain('hello there')
    expect(hasArt(view(), icon.rows + 1, 120, true)).toBe(true)
  })
  test('off fullscreen, a full view taller than half the terminal gives way to the line', () => {
    const icon = artSize(species(save.species))
    // Beside the art, the line and an empty bubble take no extra rows: the icon is the height.
    const rows = 2 * icon.rows
    expect(hasArt(view({ bubble: null }), rows, 200, false)).toBe(true)
    expect(hasArt(view({ bubble: null }), rows - 1, 200, false)).toBe(false)
    expect(hasArt(view({ bubble: null }), rows - 1, 200, true)).toBe(true)
    expect(texts(band(els, view(), 24, 200, false))).toContain('Lv1')
  })
  test('wide letters in a nickname are measured as two cells', () => {
    expect(cellWidth('ピカチュウ')).toBe(10)
    expect(cellWidth('Pika')).toBe(4)
    expect(cellWidth('🔥')).toBe(2)
    const wide = { ...view({ save: { ...save, nickname: 'ピカチュウピカチュウ' }, bubble: 'hello there', showFull: false }) }
    expect(texts(band(els, wide, 1, 48, true))).not.toContain('hello there')
  })
  test('the app draws its bars in one glyph: ▱ is a different width in its proportional font', () => {
    const out = texts(band(els, view({ showFull: false }), 1, 120, true, 'desktop'))
    expect(out).toContain('▰▰▰▰▰▰▰▰')
    expect(out).not.toContain('▱')
    expect(texts(band(els, view({ showFull: false }), 1, 120, true))).toContain('▱')
  })
  test('the terminal draws the skills beside the bubble only where the row has room for them', () => {
    expect(texts(band(els, view(), 60, 120, true))).toContain('DEBUGGING')
    expect(texts(band(els, view(), 60, 80, true))).not.toContain('DEBUGGING')
    expect(texts(band(els, view(), 60, 80, true, 'desktop'))).toContain('DEBUGGING')
  })
})
