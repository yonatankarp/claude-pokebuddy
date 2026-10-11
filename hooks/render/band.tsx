import type { Elements } from 'claude-code'
import { COMPACT_MIN_COLUMNS } from '../config'
import { species } from '../data/dex'
import type { Save } from '../state'
import { expBar, pickArt, spriteRows, TYPE_COLOR } from './sprite'

/** `frame` is the idle bob's frame, drawn only in the full view. */
export type BandView = { save: Save; bubble: string | null; showFull: boolean; evolving: boolean; frame: 0 | 1 }

export type BandElements = Pick<Elements['terminal'], 'Box' | 'Text'>

export function band(els: BandElements, view: BandView, maxRows: number, columns: number) {
  const { Box, Text } = els
  const { save } = view
  const sp = species(save.species)
  const name = save.nickname ?? sp.name
  const typeColor = TYPE_COLOR[sp.types[0]!]
  const line = (
    <Box key="line" flexDirection="row">
      <Text color={typeColor} wrap="truncate-end">◓ </Text>
      <Text bold wrap="truncate-end">{view.evolving ? `What? ${sp.name} is evolving!` : name}</Text>
      {save.isShiny && <Text color="#f8d030" wrap="truncate-end"> ★</Text>}
      <Text wrap="truncate-end"> Lv{save.level} </Text>
      <Text color={typeColor} wrap="truncate-end">{expBar(save, 8)}</Text>
      {view.bubble && columns >= COMPACT_MIN_COLUMNS && <Text dimColor wrap="truncate-end"> │ “{view.bubble}”</Text>}
    </Box>
  )
  if (!view.showFull) return line
  const art = pickArt(sp, maxRows, columns)
  if (art === null) return line
  const rows = spriteRows(sp[art], save.isShiny, view.frame)
  return (
    <Box flexDirection="column">
      {rows.map((runs, y) => (
        <Box key={`r${y}`} flexDirection="row">
          {runs.map((r, x) => <Text key={`c${y}-${x}`} color={r.fg} backgroundColor={r.bg}>{r.text}</Text>)}
        </Box>
      ))}
      {line}
    </Box>
  )
}
