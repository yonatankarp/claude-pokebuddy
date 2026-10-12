import { panel, type PanelElements, type PanelView } from '../plugin/hooks/render/panel.tsx'

/**
 * The /buddy panel as the desktop app lays it out, drawn as SVG for the README: flex boxes in pixels, native-looking
 * buttons, Svg leaves nested as they are. An approximation of the app's renderer, not a copy of it: a monospace font
 * so text measures exactly, a cell CELL pixels wide and spacing rows ROW pixels tall.
 */
type Node = { type: string; props: Record<string, any>; children: unknown[] }
type Laid = { w: number; h: number; draw: (x: number, y: number) => string[] }

const flat = (c: unknown): unknown[] => [c].flat(Infinity).filter(x => x !== null && x !== undefined && x !== false && x !== true)
const make = (type: string) => ({ children, ...props }: { children?: unknown }): Node => ({ type, props, children: flat(children) })
const els = { Box: make('Box'), Text: make('Text'), Button: make('Button'), Svg: make('Svg'), Markdown: make('Markdown') } as unknown as PanelElements

const FONT = 13, CHAR = FONT * 0.6, LINE = 20, CELL = 8, ROW = 12, PAD = 16
const BG = '#262624', FG = '#e8e6e3', BUTTON = '#3d3c39', PRIMARY = '#d97757', LINK = '#1f5fa8'
// Characters that fit in `px`: the nudge keeps a width summed from these, then taken apart again in floats, from losing one.
const fits = (px: number) => Math.floor(px / CHAR + 1e-6)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const textOf = (n: Node): string => n.children.map(c => (typeof c === 'object' ? textOf(c as Node) : String(c))).join('')
const none: Laid = { w: 0, h: 0, draw: () => [] }

/** Words wrapped to `max` pixels; a single word longer than that is left whole. */
function wrap(text: string, max: number): string[] {
  const cols = Math.max(1, fits(max))
  return text.split('\n').flatMap(para => {
    const lines: string[] = []
    let line = ''
    for (const word of para.split(/(?<= )/)) {
      if (line && (line + word).trimEnd().length > cols) { lines.push(line.trimEnd()); line = '' }
      line += word
    }
    return [...lines, line.trimEnd()]
  })
}

function text(n: Node, max: number): Laid {
  const p = n.props
  const raw = textOf(n)
  const lines = p.wrap === 'truncate-end' ? [raw.slice(0, fits(max))] : wrap(raw, max)
  const w = Math.max(...lines.map(l => l.length)) * CHAR, h = lines.length * LINE
  const attrs = `${p.color ? ` fill="${p.color}"` : ''}${p.bold ? ' font-weight="700"' : ''}${p.underline ? ' text-decoration="underline"' : ''}${p.dimColor ? ' opacity="0.55"' : ''}`
  return {
    w, h, draw: (x, y) => [
      ...(p.backgroundColor ? [`<rect x="${x}" y="${y + 1}" width="${w}" height="${h - 2}" rx="3" fill="${p.backgroundColor}"/>`] : []),
      ...lines.map((l, i) => `<text x="${x}" y="${y + i * LINE + 14}" xml:space="preserve"${attrs}>${esc(l)}</text>`),
    ],
  }
}

function button(n: Node): Laid {
  const label = n.props.label ?? textOf(n)
  const w = label.length * CHAR + 20, h = LINE + 4
  const primary = n.props.variant === 'primary'
  return {
    w, h, draw: (x, y) => [
      `<g${n.props.dimColor ? ' opacity="0.5"' : ''}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${primary ? PRIMARY : BUTTON}"/>`,
      `<text x="${x + 10}" y="${y + 16}" fill="${primary ? '#ffffff' : FG}">${esc(label)}</text></g>`,
    ],
  }
}

function svg(n: Node): Laid {
  const { source, width: w, height: h } = n.props as { source: string; width: number; height: number }
  const inner = source.replace(/^<svg [^>]*>/, '').replace(/<\/svg>$/, '')
  const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1]
  return { w, h, draw: (x, y) => [`<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${viewBox}" shape-rendering="crispEdges">${inner}</svg>`] }
}

/** A Box: margins, border, padding and background around its children in a row or column, as Yoga places them. */
function box(n: Node, max: number, force?: number, forceH?: number): Laid {
  const p = n.props
  if (p.display === 'none') return none
  const ml = (p.marginLeft ?? p.marginX ?? p.margin ?? 0) * CELL, mr = (p.marginRight ?? p.marginX ?? p.margin ?? 0) * CELL
  const mt = (p.marginTop ?? p.marginY ?? p.margin ?? 0) * ROW, mb = (p.marginBottom ?? p.marginY ?? p.margin ?? 0) * ROW
  const b = p.borderStyle ? 2 : 0
  const px = (p.paddingX ?? p.padding ?? 0) * CELL + b, py = (p.paddingY ?? p.padding ?? 0) * ROW + b
  const fixed = force !== undefined ? force - ml - mr : typeof p.width === 'number' ? p.width * CELL : p.width === '100%' ? max - ml - mr : undefined
  const room = (fixed ?? max - ml - mr) - px * 2
  const isRow = p.flexDirection !== 'column'
  const kids = n.children.filter(c => typeof c === 'object') as Node[]
  type Placed = { laid: Laid; x: number; y: number }
  let placed: Placed[] = []
  let innerW: number, innerH: number
  if (isRow) {
    // Lines of children: a wrapping row starts a new line when the next child does not fit.
    const lines: { node: Node; laid: Laid }[][] = [[]]
    let used = 0
    for (const k of kids) {
      let laid = lay(k, p.flexWrap === 'wrap' ? room : Math.max(room - used, CHAR))
      if (p.flexWrap === 'wrap' && used > 0 && used + laid.w > room) { lines.push([]); used = 0; laid = lay(k, room) }
      lines[lines.length - 1]!.push({ node: k, laid })
      used += laid.w
    }
    // A row stretches the Boxes in it to the line's height, unless it aligns them.
    if (!p.alignItems || p.alignItems === 'stretch') {
      for (const line of lines) {
        const lh = Math.max(0, ...line.map(k => k.laid.h))
        for (const k of line) if (k.node.type === 'Box' && k.laid.h < lh) k.laid = box(k.node, k.laid.w, k.laid.w, lh)
      }
    }
    const widths = lines.map(l => l.reduce((a, k) => a + k.laid.w, 0))
    innerW = fixed !== undefined || p.justifyContent === 'space-between' ? room : Math.max(...widths)
    let y = 0
    lines.forEach((line, i) => {
      const lh = Math.max(0, ...line.map(k => k.laid.h))
      const free = innerW - widths[i]!
      const gap = p.justifyContent === 'space-between' && line.length > 1 ? free / (line.length - 1) : 0
      let x = p.justifyContent === 'center' ? free / 2 : 0
      for (const { laid: k } of line) {
        placed.push({ laid: k, x, y: p.alignItems === 'center' ? y + (lh - k.h) / 2 : y })
        x += k.w + gap
      }
      y += lh
    })
    innerH = y
  } else {
    let laid = kids.map(k => lay(k, room))
    innerW = fixed !== undefined ? room : Math.max(0, ...laid.map(k => k.w))
    // A column stretches the Boxes in it to its width, unless it centres them.
    if (p.alignItems !== 'center') laid = kids.map((k, i) => (k.type === 'Box' ? box(k, innerW, innerW) : laid[i]!))
    let y = 0
    placed = laid.map(k => {
      const at = { laid: k, x: p.alignItems === 'center' ? (innerW - k.w) / 2 : 0, y }
      y += k.h
      return at
    })
    innerH = y
  }
  const w = innerW + px * 2, h = Math.max(innerH + py * 2, (forceH ?? 0) - mt - mb)
  return {
    w: w + ml + mr, h: h + mt + mb, draw: (x, y) => {
      const bx = x + ml, by = y + mt
      const shell = p.backgroundColor || p.borderStyle
        ? [`<rect x="${bx + b / 2}" y="${by + b / 2}" width="${w - b}" height="${h - b}" rx="${p.borderStyle === 'round' ? 8 : 0}"` +
            ` fill="${p.backgroundColor ?? 'none'}"${b ? ` stroke="${p.borderColor ?? '#55534f'}" stroke-width="${b}"` : ''}/>`]
        : []
      return [...shell, ...placed.flatMap(k => k.laid.draw(bx + px + k.x, by + py + k.y))]
    },
  }
}

/** A Markdown that is one link, `[label](url)`, bold in `**`: the label underlined in a link colour. Only what the panel writes. */
function markdown(n: Node, max: number): Laid {
  const md = String(n.props.text)
  const label = /\[([^\]]*)\]/.exec(md)?.[1] ?? md
  return text({ type: 'Text', props: { color: LINK, bold: md.startsWith('**'), underline: true }, children: [label] }, max)
}

function lay(n: Node, max: number): Laid {
  return n.type === 'Markdown' ? markdown(n, max) : n.type === 'Text' ? text(n, max) : n.type === 'Button' ? button(n) : n.type === 'Svg' ? svg(n) : box(n, max)
}

/** The /buddy panel on `view`'s tab as the desktop app draws it, `width` pixels wide, on its dark theme. */
export function renderDesktopPanel(view: PanelView, width = 640): string {
  const noop = { run: () => {}, tab: () => {}, releasing: () => {}, dex: () => {} }
  const laid = box({ type: 'Box', props: { flexDirection: 'column' }, children: [panel(els, view, noop, true, true)] }, width, width)
  const W = laid.w + PAD * 2, H = laid.h + PAD * 2
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" rx="10" fill="${BG}"/>`,
    `<g font-family="'SF Mono', Menlo, Consolas, monospace" font-size="${FONT}" fill="${FG}">${laid.draw(PAD, PAD).join('')}</g>`,
    '</svg>',
    '',
  ].join('\n')
}
