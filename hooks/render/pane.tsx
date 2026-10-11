import { species } from '../data/dex'
import { artRows, bubbleBox, drawRows, sideBubble, type BandElements, type BandView, type Layout } from './band'
import { expBar, fitArt, TYPE_COLOR, type Art } from './sprite'

/** Rows under the art: the name and level, the EXP bar, the bubble. */
export const PANE_TEXT_ROWS = 3
/** Rows under the bubble when it stands beside the art: the name and level, the EXP bar. */
const SIDE_TEXT_ROWS = 2

/** The sprite before the icon, each with the bubble beside it if it fits, else over the text; null is text alone. */
export function paneLayout(view: BandView, rows: number, columns: number): Layout | null {
  const sp = species(view.save.species)
  for (const art of ['sprite', 'icon'] as const) {
    const side = sideBubble(sp, art, view.bubble, rows, columns, SIDE_TEXT_ROWS)
    if (side) return { art, side }
    if (fitArt(sp, rows - PANE_TEXT_ROWS, columns) === art) return { art, side: null }
  }
  return null
}

/** The art the pane draws in `rows` x `columns`: the animated sprite, else the still icon, else none. */
export function paneArt(view: BandView, rows: number, columns: number): Art | null {
  return paneLayout(view, rows, columns)?.art ?? null
}

export function pane(els: BandElements, view: BandView, rows: number, columns: number) {
  const { Box, Text } = els
  const { save } = view
  const sp = species(save.species)
  const typeColor = TYPE_COLOR[sp.types[0]!]
  const layout = paneLayout(view, rows, columns)
  const text = [
    <Box key="name" flexDirection="row">
      <Text bold wrap="truncate-end">{view.evolving ? `What? ${sp.name} is evolving!` : (save.nickname ?? sp.name)}</Text>
      {save.isShiny && <Text color="#f8d030" wrap="truncate-end"> ★</Text>}
      <Text wrap="truncate-end"> Lv{save.level}</Text>
    </Box>,
    <Box key="exp" flexDirection="row">
      <Text dimColor wrap="truncate-end">EXP </Text>
      <Text color={typeColor} wrap="truncate-end">{expBar(save, Math.max(4, Math.min(20, columns - 4)))}</Text>
    </Box>,
  ]
  if (layout?.side) {
    return (
      <Box flexDirection="row">
        <Box key="art" flexDirection="column">{drawRows(els, artRows(view, layout.art))}</Box>
        <Box key="side" flexDirection="column" marginLeft={2}>
          {layout.side.lines.length > 0 && bubbleBox(els, layout.side)}
          {text}
        </Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      {layout && drawRows(els, artRows(view, layout.art))}
      {text}
      <Text key="bubble" dimColor wrap="truncate-end">{view.bubble ? `“${view.bubble}”` : ' '}</Text>
    </Box>
  )
}
