import type { Elements, RenderSurface } from 'claude-code'
import { skillStats } from '../commands'
import { species } from '../data/dex'
import type { Save } from '../state'
import type { Species } from '../data/types'
import { artSize, expBar, fitArt, spriteRows, spriteSvg, TYPE_COLOR, type Run } from './sprite'

/** `showFull` is the full view, by choice or for a level-up or evolution flash. */
export type BandView = { save: Save; bubble: string | null; showFull: boolean; evolving: boolean }

/** `Svg` off the terminal (desktop, editor, mobile): the art is drawn as pixels there, not half-blocks. */
export type BandElements = Pick<Elements['terminal'], 'Box' | 'Text'> & Partial<Pick<Elements['desktop'], 'Svg'>>

// CSS pixels per sprite pixel where the art is an Svg.
const SVG_SCALE = 6

/** The bubble beside the art: its width with border and padding, and its text cut into rows. */
export type Side = { width: number; lines: string[] }
export type Layout = { side: Side | null }

const BUBBLE_MIN = 24
const BUBBLE_MAX = 40
// Beside the art: a gap of 2, the tail and room to spare.
const SIDE_EXTRA = 6
// The bubble's border and padding, left and right.
const BUBBLE_FRAME = 4
// Less room than this on the line drops the inline bubble rather than show a stub of it.
const INLINE_MIN = 12

/** Cells a code point takes: 0 for joiners and combining marks, 2 for East Asian wide letters and emoji. */
function codePointWidth(cp: number): number {
  if ((cp >= 0x300 && cp <= 0x36f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)) return 2
  return 1
}

/** Terminal cells `text` takes, so a nickname of wide letters or emoji is measured as drawn. */
export function cellWidth(text: string): number {
  let n = 0
  for (const ch of text) n += codePointWidth(ch.codePointAt(0)!)
  return n
}

/** Words wrapped to `width`; a word longer than that is broken. */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (line) { lines.push(line); line = '' }
      lines.push(word.slice(0, width))
      word = word.slice(width)
    }
    if (!word) continue
    if (!line) line = word
    else if (line.length + 1 + word.length <= width) line += ' ' + word
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
}

/** At most `max` rows, the last one ending in an ellipsis when rows were cut. */
function cutLines(lines: string[], max: number, width: number): string[] {
  if (lines.length <= max) return lines
  const kept = lines.slice(0, max)
  kept[max - 1] = kept[max - 1]!.slice(0, width - 1) + '…'
  return kept
}

/**
 * The bubble beside `art` in `rows` x `columns`, with `below` rows of text under the bubble; null when
 * it does not fit. The art and the bubble with its text stand side by side, so the taller sets the height.
 */
export function sideBubble(sp: Species, bubble: string | null, rows: number, columns: number, below: number): Side | null {
  const size = artSize(sp)
  const width = Math.min(BUBBLE_MAX, columns - size.cols - SIDE_EXTRA)
  if (width < BUBBLE_MIN || size.rows > rows) return null
  if (!bubble) return below <= rows ? { width, lines: [] } : null
  const room = rows - below - 2
  if (room < 1) return null
  return { width, lines: cutLines(wrapText(bubble, width - BUBBLE_FRAME), room, width - BUBBLE_FRAME) }
}

/**
 * The band's full view: the icon with the bubble beside it if it fits, else over the line; null is the line
 * alone. Off fullscreen `maxRows` is the whole terminal, so a full view taller than half of it gives way to
 * the line; in fullscreen the engine has already capped the band's slot.
 */
export function bandLayout(view: BandView, maxRows: number, columns: number, isFullscreen: boolean): Layout | null {
  if (!view.showFull) return null
  const sp = species(view.save.species)
  const fits = (rows: number) => isFullscreen || rows <= maxRows / 2
  const side = sideBubble(sp, view.bubble, maxRows, columns, 1)
  if (side && fits(Math.max(artSize(sp).rows, (side.lines.length > 0 ? side.lines.length + 2 : 0) + 1))) return { side }
  return fitArt(sp, maxRows - 1, columns) && fits(artSize(sp).rows + 1) ? { side: null } : null
}

/** The rows of the icon in the buddy's palette, shiny or not. */
export function artRows(view: BandView): Run[][] {
  return spriteRows(species(view.save.species).icon, view.save.isShiny)
}

export function drawRows({ Box, Text }: BandElements, rows: Run[][]) {
  return rows.map((runs, y) => (
    <Box key={`r${y}`} flexDirection="row">
      {runs.map((r, x) => <Text key={`c${y}-${x}`} color={r.fg} backgroundColor={r.bg}>{r.text}</Text>)}
    </Box>
  ))
}

/** The bubble with its tail on its first text row, as `side` cut it. */
export function bubbleBox({ Box, Text }: BandElements, side: Side) {
  return (
    <Box key="bubble" flexDirection="row">
      <Box flexDirection="column">
        <Text> </Text>
        <Text dimColor>◀</Text>
      </Box>
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} width={side.width}>
        {side.lines.map((l, i) => <Text key={`b${i}`} wrap="truncate-end">{l}</Text>)}
      </Box>
    </Box>
  )
}

export function band(els: BandElements, view: BandView, maxRows: number, columns: number, isFullscreen: boolean, surface: RenderSurface = 'terminal') {
  const { Box, Text } = els
  const { save } = view
  const sp = species(save.species)
  const name = save.nickname ?? sp.name
  const typeColor = TYPE_COLOR[sp.types[0]!]
  const title = view.evolving ? `What? ${sp.name} is evolving!` : name
  const level = ` Lv${save.level} `
  const room = columns - (2 + cellWidth(title) + (save.isShiny ? 2 : 0) + level.length + 8)
  const said = view.bubble ? ` │ “${view.bubble}”` : ''
  const inline = room < INLINE_MIN || !said ? null : said.length <= room ? said : said.slice(0, room - 1) + '…'
  // The terminal's table hands back an Svg that draws nothing, so the surface decides, not the element.
  const isApp = surface !== 'terminal'
  const bar = expBar(save, 8)
  // The app's font is proportional: the empty half is a dimmed ▰, as ▱ is a different width there.
  const barFilled = isApp ? bar.replaceAll('▱', '') : bar
  const line = (isBubbleInline: boolean) => (
    <Box key="line" flexDirection="row">
      <Text color={typeColor} wrap="truncate-end">◓ </Text>
      <Text bold wrap="truncate-end">{title}</Text>
      {save.isShiny && <Text color="#f8d030" wrap="truncate-end"> ★</Text>}
      <Text wrap="truncate-end">{level}</Text>
      <Text color={typeColor} wrap="truncate-end">{barFilled}</Text>
      {isApp && <Text dimColor wrap="truncate-end">{'▰'.repeat(bar.length - barFilled.length)}</Text>}
      {isBubbleInline && inline && <Text dimColor wrap="truncate-end">{inline}</Text>}
    </Box>
  )
  const layout = bandLayout(view, maxRows, columns, isFullscreen)
  if (layout === null) return line(true)
  const { icon } = sp
  const art = isApp && els.Svg
    ? <els.Svg key="svg" source={spriteSvg(icon, save.isShiny)} alt={`${sp.name} sprite`} width={icon.w * SVG_SCALE} height={icon.h * SVG_SCALE} />
    : drawRows(els, artRows(view))
  if (layout.side === null) {
    return (
      <Box flexDirection="column">
        {art}
        {line(true)}
      </Box>
    )
  }
  return (
    <Box flexDirection="row">
      <Box key="art" flexDirection="column">{art}</Box>
      <Box key="side" flexDirection="column" marginLeft={2}>
        {layout.side.lines.length > 0 && bubbleBox(els, layout.side)}
        {line(false)}
      </Box>
      {(isApp || artSize(sp).cols + 2 + Math.max(1 + layout.side.width, columns - room) + skillsWidth(save) <= columns) &&
        skillColumns(els, save, typeColor, isApp)}
    </Box>
  )
}

/** Columns the skills take beside the bubble: margin, names, bar, values. */
function skillsWidth(save: Save): number {
  return 2 + Math.max(...skillStats(save).map(k => k.name.length)) + 1 + 10 + 1 + 2
}

/**
 * The skills beside the bubble: names, ten-step bars in the type colour, values. Three columns, not padded
 * rows, because the desktop font is proportional and padding would not line the bars up. The terminal ends
 * each bar in ▱ like the EXP bar; the app in a dimmed ▰, as ▱ is a different width in its font.
 */
function skillColumns({ Box, Text }: BandElements, save: Save, color: string, isApp: boolean) {
  const stats = skillStats(save)
  return (
    <Box key="skills" flexDirection="row" marginLeft={2}>
      <Box flexDirection="column">{stats.map(k => <Text key={k.name} dimColor>{k.name}</Text>)}</Box>
      <Box flexDirection="column" marginLeft={1}>
        {stats.map(k => {
          const filled = Math.round(k.value / 10)
          return (
            <Box key={k.name} flexDirection="row">
              <Text color={color}>{'▰'.repeat(filled)}</Text>
              {isApp ? <Text dimColor>{'▰'.repeat(10 - filled)}</Text> : <Text color={color}>{'▱'.repeat(10 - filled)}</Text>}
            </Box>
          )
        })}
      </Box>
      <Box flexDirection="column" marginLeft={1}>{stats.map(k => <Text key={k.name}>{String(k.value)}</Text>)}</Box>
    </Box>
  )
}
