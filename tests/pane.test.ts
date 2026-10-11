import { describe, expect, test } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'
import type { BandElements, BandView } from '../hooks/render/band'
import { pane, paneArt, PANE_TEXT_ROWS } from '../hooks/render/pane'
import { species } from '../hooks/data/dex'
import { freshSave } from '../hooks/state'
import { artSize } from '../hooks/render/sprite'
import { IDLE_REST_MS, TICK_MS } from '../hooks/config'

type Fake = { children?: unknown } & Record<string, unknown>
const make = (type: 'Box' | 'Text') => ({ children, ...props }: Fake): RenderElement => ({
  type,
  props: props as Record<string, string | number | boolean>,
  children: [children].flat(Infinity).filter((c): c is RenderNode => typeof c === 'string' || (typeof c === 'object' && c !== null)),
}) as RenderElement
type Node = { props?: Record<string, unknown>; children?: unknown[] }
const all = (n: unknown): Node[] => (typeof n === 'object' && n ? [n as Node, ...((n as Node).children ?? []).flatMap(all)] : [])
const bubbleBox = (n: unknown) => all(n).find(x => x.props?.borderStyle === 'round')
const els: BandElements = { Box: make('Box'), Text: make('Text') }
const texts = (n: unknown): string =>
  typeof n === 'string' ? n : n && typeof n === 'object' && 'children' in n ? ((n as { children?: unknown[] }).children ?? []).map(texts).join('') : ''

const save = { ...freshSave([1, 2, 3, 4]), species: 25, nickname: 'Sparky' }
const view = (over: Partial<BandView> = {}): BandView => ({ save, bubble: 'pika pika', showFull: true, evolving: false, now: 0, flashStart: null, ...over })
const sp = species(25)
const roomy = artSize(sp, 'sprite').rows + PANE_TEXT_ROWS

describe('pane', () => {
  test('the animated sprite, the name, level, EXP bar and the bubble', () => {
    const out = texts(pane(els, view(), roomy, 60))
    expect(paneArt(view(), roomy, 60)).toBe('sprite')
    expect(out).toMatch(/[▀▄]/)
    expect(out).toContain('Sparky')
    expect(out).toContain('Lv5')
    expect(out).toMatch(/EXP [▰▱]+/)
    expect(out).toContain('pika pika')
  })
  test('it animates with the clock while the sprite fits', () => {
    const cycle = sp.anim.idle.reduce((ms, s) => ms + s.ticks * TICK_MS, 0) + IDLE_REST_MS
    const t0 = 9 * cycle + 2, t1 = 9 * cycle + (sp.anim.idle[0]!.ticks + 1) * TICK_MS
    expect(texts(pane(els, view({ now: t1 }), roomy, 60))).not.toBe(texts(pane(els, view({ now: t0 }), roomy, 60)))
  })
  test('the still icon when only that fits, and text alone below it', () => {
    expect(paneArt(view(), roomy - 1, 60)).toBe('icon')
    const icon = artSize(sp, 'icon')
    expect(paneArt(view(), icon.rows + PANE_TEXT_ROWS, icon.cols)).toBe('icon')
    expect(paneArt(view(), icon.rows + PANE_TEXT_ROWS - 1, icon.cols + 29)).toBe(null)
    expect(paneArt(view(), icon.rows, 60)).toBe('icon')
    expect(texts(pane(els, view(), 2, 10))).toContain('Sparky')
  })
  test('a shiny buddy is starred', () => {
    const shiny = texts(pane(els, view({ save: { ...save, isShiny: true } }), roomy, 60))
    expect(shiny).toContain('★')
  })
  test('wide enough: the bubble in a round border beside the sprite, the name and EXP under it', () => {
    const rows = artSize(sp, 'sprite').rows
    expect(paneArt(view(), rows, 120)).toBe('sprite')
    const out = pane(els, view(), rows, 120)
    expect(texts(bubbleBox(out))).toContain('pika pika')
    expect(texts(out)).toContain('◀')
    expect(texts(out)).toContain('Sparky')
    expect(texts(out)).toMatch(/EXP [▰▱]+/)
    expect(texts(out)).not.toContain('“pika pika”')
  })
  test('too narrow for the bubble beside the art: the bubble under it as before', () => {
    const out = pane(els, view(), roomy, 60)
    expect(bubbleBox(out)).toBeUndefined()
    expect(texts(out)).toContain('“pika pika”')
  })
})
