import type { Elements } from 'claude-code'
import { COMPACT_MIN_COLUMNS } from '../config'
import { species } from '../data/dex'
import type { Save } from '../state'
import type { Species } from '../data/types'
import { artSize, expBar, fitArt, spriteRows, TYPE_COLOR, type Art, type Run } from './sprite'

/** `showFull` is the full view, by choice or for a level-up or evolution flash. */
export type BandView = { save: Save; bubble: string | null; showFull: boolean; evolving: boolean }

export type BandElements = Pick<Elements['terminal'], 'Box' | 'Text'>

/** The bubble beside the art: its width with border and padding, and its text cut into rows. */
export type Side = { width: number; lines: string[] }
export type Layout = { art: Art; side: Side | null }

const BUBBLE_MIN = 24
const BUBBLE_MAX = 40
// Beside the art: a gap of 2, the tail and room to spare.
const SIDE_EXTRA = 6
// The bubble's border and padding, left and right.
const BUBBLE_FRAME = 4

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
export function sideBubble(sp: Species, art: Art, bubble: string | null, rows: number, columns: number, below: number): Side | null {
  const size = artSize(sp, art)
  const width = Math.min(BUBBLE_MAX, columns - size.cols - SIDE_EXTRA)
  if (width < BUBBLE_MIN || size.rows > rows) return null
  if (!bubble) return below <= rows ? { width, lines: [] } : null
  const room = rows - below - 2
  if (room < 1) return null
  return { width, lines: cutLines(wrapText(bubble, width - BUBBLE_FRAME), room, width - BUBBLE_FRAME) }
}

/** The band's full view: the sprite before the icon, each with the bubble beside it if it fits, else over the line. */
export function bandLayout(view: BandView, maxRows: number, columns: number): Layout | null {
  if (!view.showFull) return null
  const sp = species(view.save.species)
  for (const art of ['sprite', 'icon'] as const) {
    const side = sideBubble(sp, art, view.bubble, maxRows, columns, 1)
    if (side) return { art, side }
    if (fitArt(sp, maxRows - 1, columns) === art) return { art, side: null }
  }
  return null
}

/** The art the band draws: the Crystal sprite, else the icon; null is the line alone. */
export function bandArt(view: BandView, maxRows: number, columns: number): Art | null {
  return bandLayout(view, maxRows, columns)?.art ?? null
}

/** The rows of `art` in the buddy's palette, shiny or not. */
export function artRows(view: BandView, art: Art): Run[][] {
  const sp = species(view.save.species)
  return spriteRows(art === 'icon' ? sp.icon : sp.sprite, view.save.isShiny)
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

export function band(els: BandElements, view: BandView, maxRows: number, columns: number) {
  const { Box, Text } = els
  const { save } = view
  const sp = species(save.species)
  const name = save.nickname ?? sp.name
  const typeColor = TYPE_COLOR[sp.types[0]!]
  const line = (isBubbleInline: boolean) => (
    <Box key="line" flexDirection="row">
      <Text color={typeColor} wrap="truncate-end">◓ </Text>
      <Text bold wrap="truncate-end">{view.evolving ? `What? ${sp.name} is evolving!` : name}</Text>
      {save.isShiny && <Text color="#f8d030" wrap="truncate-end"> ★</Text>}
      <Text wrap="truncate-end"> Lv{save.level} </Text>
      <Text color={typeColor} wrap="truncate-end">{expBar(save, 8)}</Text>
      {isBubbleInline && view.bubble && columns >= COMPACT_MIN_COLUMNS && <Text dimColor wrap="truncate-end"> │ “{view.bubble}”</Text>}
    </Box>
  )
  const layout = bandLayout(view, maxRows, columns)
  if (layout === null) return line(true)
  const art = drawRows(els, artRows(view, layout.art))
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
    </Box>
  )
}
