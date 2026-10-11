import { species } from '../data/dex'
import { artRows, drawRows, type BandElements, type BandView } from './band'
import { expBar, fitArt, TYPE_COLOR, type Art } from './sprite'

/** Rows under the art: the name and level, the EXP bar, the bubble. */
export const PANE_TEXT_ROWS = 3

/** The art the pane draws over its text in `rows` x `columns`: the animated sprite, else the still icon, else none. */
export function paneArt(view: BandView, rows: number, columns: number): Art | null {
  return fitArt(species(view.save.species), rows - PANE_TEXT_ROWS, columns)
}

export function pane(els: BandElements, view: BandView, rows: number, columns: number) {
  const { Box, Text } = els
  const { save } = view
  const sp = species(save.species)
  const typeColor = TYPE_COLOR[sp.types[0]!]
  const art = paneArt(view, rows, columns)
  return (
    <Box flexDirection="column">
      {art && drawRows(els, artRows(view, art))}
      <Box key="name" flexDirection="row">
        <Text bold wrap="truncate-end">{view.evolving ? `What? ${sp.name} is evolving!` : (save.nickname ?? sp.name)}</Text>
        {save.isShiny && <Text color="#f8d030" wrap="truncate-end"> ★</Text>}
        <Text wrap="truncate-end"> Lv{save.level}</Text>
      </Box>
      <Box key="exp" flexDirection="row">
        <Text dimColor wrap="truncate-end">EXP </Text>
        <Text color={typeColor} wrap="truncate-end">{expBar(save, Math.max(4, Math.min(20, columns - 4)))}</Text>
      </Box>
      <Text key="bubble" dimColor wrap="truncate-end">{view.bubble ? `“${view.bubble}”` : ' '}</Text>
    </Box>
  )
}
