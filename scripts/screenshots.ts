import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { band, type BandElements, type BandView } from '../hooks/render/band.tsx'
import { species } from '../hooks/data/dex.ts'
import { expForLevel } from '../hooks/exp.ts'
import { freshSave, parseSave, type Save } from '../hooks/state.ts'

type Node = { type: 'Box' | 'Text'; props: Record<string, unknown>; children: (Node | string)[] }
type Cell = { ch: string; fg?: string; bg?: string; bold?: boolean; dim?: boolean }
type Grid = { w: number; rows: Cell[][] }

const flat = (children: unknown): (Node | string)[] =>
  [children].flat(Infinity).filter((c): c is Node | string => typeof c === 'string' || (typeof c === 'object' && c !== null))
const make = (type: Node['type']) => ({ children, ...props }: { children?: unknown }): Node => ({ type, props, children: flat(children) })
const els = { Box: make('Box'), Text: make('Text') } as unknown as BandElements

// band.tsx is compiled with `h` as its JSX factory; outside Claude Code the components are the fakes above.
;(globalThis as Record<string, unknown>).h = (type: (p: object) => Node, props: object | null, ...children: unknown[]) =>
  type({ ...props, children })

const blank = (): Cell => ({ ch: ' ' })
const pad = (row: Cell[], w: number) => [...row, ...Array.from({ length: Math.max(0, w - row.length) }, blank)]

/** Lays a node out the way the terminal does: Text on one row, a row Box side by side, a column Box stacked. */
function layout(node: Node | string, style: Omit<Cell, 'ch'> = {}): Grid {
  if (typeof node === 'string') {
    const row = Array.from(node).map(ch => ({ ch, ...style }))
    return { w: row.length, rows: [row] }
  }
  const p = node.props
  if (node.type === 'Text') {
    const own = {
      ...style,
      ...(p.color ? { fg: p.color as string } : {}),
      ...(p.backgroundColor ? { bg: p.backgroundColor as string } : {}),
      ...(p.bold ? { bold: true } : {}),
      ...(p.dimColor ? { dim: true } : {}),
    }
    const row = node.children.flatMap(c => layout(c, own).rows[0] ?? [])
    return { w: row.length, rows: [row] }
  }
  const kids = node.children.map(c => layout(c, style))
  let grid: Grid
  if (p.flexDirection === 'column') {
    const w = Math.max(0, ...kids.map(k => k.w))
    grid = { w, rows: kids.flatMap(k => k.rows.map(r => pad(r, w))) }
  } else {
    const h = Math.max(0, ...kids.map(k => k.rows.length))
    const rows = Array.from({ length: h }, (_, y) => kids.flatMap(k => pad(k.rows[y] ?? [], k.w)))
    grid = { w: kids.reduce((a, k) => a + k.w, 0), rows }
  }
  const px = (p.paddingX as number | undefined) ?? 0
  const border = p.borderStyle === 'round'
  if (typeof p.width === 'number') grid.w = p.width - px * 2 - (border ? 2 : 0)
  grid.rows = grid.rows.map(r => pad(r, grid.w).slice(0, grid.w))
  if (px) {
    const side = () => Array.from({ length: px }, blank)
    grid = { w: grid.w + px * 2, rows: grid.rows.map(r => [...side(), ...r, ...side()]) }
  }
  if (border) {
    const dim = p.borderDimColor === true
    const c = (ch: string): Cell => (dim ? { ch, dim } : { ch })
    const line = (l: string, r: string) => [c(l), ...Array.from({ length: grid.w }, () => c('─')), c(r)]
    grid = { w: grid.w + 2, rows: [line('╭', '╮'), ...grid.rows.map(r => [c('│'), ...r, c('│')]), line('╰', '╯')] }
  }
  const ml = (p.marginLeft as number | undefined) ?? 0
  if (ml) grid = { w: grid.w + ml, rows: grid.rows.map(r => [...Array.from({ length: ml }, blank), ...r]) }
  return grid
}

const CW = 9, CH = 18, PAD = 14
const FG = '#d4d4d4', MUTED = '#808080'
const R = 4
/** Box-drawing characters drawn as lines through the cell's centre, so the border joins up like a terminal draws it. */
const BOX: Record<string, (x: number, y: number) => string> = {
  '─': (x, y) => `M${x} ${y + CH / 2}h${CW}`,
  '│': (x, y) => `M${x + CW / 2} ${y}v${CH}`,
  '╭': (x, y) => `M${x + CW / 2} ${y + CH}V${y + CH / 2 + R}a${R} ${R} 0 0 1 ${R} ${-R}H${x + CW}`,
  '╮': (x, y) => `M${x} ${y + CH / 2}H${x + CW / 2 - R}a${R} ${R} 0 0 1 ${R} ${R}V${y + CH}`,
  '╰': (x, y) => `M${x + CW / 2} ${y}V${y + CH / 2 - R}a${R} ${R} 0 0 0 ${R} ${R}H${x + CW}`,
  '╯': (x, y) => `M${x} ${y + CH / 2}H${x + CW / 2 - R}a${R} ${R} 0 0 0 ${R} ${-R}V${y}`,
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function toSvg(rows: Cell[][]): string {
  const cols = Math.max(...rows.map(r => r.length))
  const width = cols * CW + PAD * 2, height = rows.length * CH + PAD * 2
  const rects: string[] = []
  const texts: string[] = []
  const lines = new Map<string, string>()
  const halves = (y: number, top: boolean) => rows[y]!.map(c => {
    if (c.ch === '▀') return top ? c.fg : c.bg
    if (c.ch === '▄') return top ? c.bg : c.fg
    return c.bg
  })
  rows.forEach((row, y) => {
    for (const top of [true, false]) {
      const fills = halves(y, top)
      for (let x = 0; x < fills.length;) {
        const f = fills[x]
        let n = 1
        while (f && fills[x + n] === f) n++
        if (f) rects.push(`<rect x="${PAD + x * CW}" y="${PAD + y * CH + (top ? 0 : CH / 2)}" width="${n * CW}" height="${CH / 2}" fill="${f}"/>`)
        x += n
      }
    }
    const style = (c: Cell) => `${c.fg ?? FG}|${c.bold ? 1 : 0}|${c.dim ? 1 : 0}`
    const isText = (c: Cell | undefined) => !!c && c.ch !== ' ' && c.ch !== '▀' && c.ch !== '▄' && !(c.ch in BOX)
    row.forEach((c, x) => {
      const draw = BOX[c.ch]
      if (!draw) return
      const key = `${c.fg ?? FG}|${c.dim ? 1 : 0}`
      lines.set(key, (lines.get(key) ?? '') + draw(PAD + x * CW, PAD + y * CH))
    })
    for (let x = 0; x < row.length;) {
      const c = row[x]!
      if (!isText(c)) { x++; continue }
      let n = 1
      while (isText(row[x + n]) && style(row[x + n]!) === style(c)) n++
      const xs = Array.from({ length: n }, (_, i) => PAD + (x + i) * CW).join(' ')
      const attrs = `${c.fg && c.fg !== FG ? ` fill="${c.fg}"` : ''}${c.bold ? ' font-weight="700"' : ''}${c.dim ? ' opacity="0.6"' : ''}`
      texts.push(`<text x="${xs}" y="${PAD + y * CH + 13}"${attrs}>${esc(row.slice(x, x + n).map(k => k.ch).join(''))}</text>`)
      x += n
    }
  })
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" rx="8" fill="#1e1e1e"/>`,
    `<g shape-rendering="crispEdges">${rects.join('')}</g>`,
    ...[...lines].map(([key, d]) => {
      const [fg, dim] = key.split('|')
      return `<path d="${d}" fill="none" stroke="${fg}" stroke-width="1.2"${dim === '1' ? ' opacity="0.6"' : ''}/>`
    }),
    `<g font-family="'SF Mono', Menlo, Consolas, monospace" font-size="15" fill="${FG}">${texts.join('')}</g>`,
    '</svg>',
    '',
  ].join('\n')
}

/** The band for `view` in `maxRows` x `columns`, with the prompt under it, as an SVG. */
export function renderScene(view: BandView, maxRows: number, columns: number): string {
  const grid = layout(band(els, view, maxRows, columns) as unknown as Node)
  const rows = grid.rows.map(r => pad(r, grid.w))
  const prompt: Cell[] = [{ ch: '>', fg: MUTED }, { ch: ' ' }, { ch: ' ', bg: MUTED }]
  return toSvg([...rows, [], prompt])
}

/** A fresh save made into `id` at `level`, part way to the next level, checked by the save parser. */
export function sceneSave(id: number, level: number, over: Partial<Save> = {}): Save {
  const growth = species(id).growth
  const lo = expForLevel(growth, level), hi = expForLevel(growth, level + 1)
  const save: Save = { ...freshSave([1, 2, 3, 4]), species: id, level, exp: lo + Math.floor((hi - lo) * 0.6), isShiny: false, view: 'full', ...over }
  const parsed = parseSave(JSON.parse(JSON.stringify(save)))
  if (parsed.kind !== 'ok') throw new Error(`scene save for #${id} does not validate`)
  return parsed.save
}

const ROWS = 20, COLUMNS = 100

export function scenes(): Record<string, string> {
  const charmander = sceneSave(4, 12)
  const said = 'Char! Tests are green again, nice work.'
  const view = (over: Partial<BandView>): BandView => ({ save: charmander, bubble: said, showFull: true, evolving: false, ...over })
  return {
    'full.svg': renderScene(view({}), ROWS, COLUMNS),
    'compact.svg': renderScene(view({ save: { ...charmander, view: 'compact' }, showFull: false }), ROWS, COLUMNS),
    'shiny.svg': renderScene(view({ save: sceneSave(25, 22, { isShiny: true }), bubble: 'Pika pika! A shiny day for a push.' }), ROWS, COLUMNS),
    'evolving.svg': renderScene(view({ save: sceneSave(4, 16, { evolution: { to: 5 } }), bubble: null, evolving: true }), ROWS, COLUMNS),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = join(import.meta.dirname, '..', 'docs', 'images')
  mkdirSync(dir, { recursive: true })
  for (const [name, svg] of Object.entries(scenes())) {
    writeFileSync(join(dir, name), svg)
    console.log(`wrote docs/images/${name} (${svg.length} bytes)`)
  }
}
