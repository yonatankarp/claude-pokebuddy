import type { Elements } from 'claude-code'
import { COMPACT_MIN_COLUMNS } from '../config'
import { species } from '../data/dex'
import type { Save } from '../state'
import { frameAt } from './anim'
import { expBar, frameRows, pickArt, spriteRows, TYPE_COLOR, type Art, type Run } from './sprite'

/** `now` picks the animation frame; `flashStart`, set while a level-up or evolution flash runs, plays the intro. */
export type BandView = { save: Save; bubble: string | null; showFull: boolean; evolving: boolean; now: number; flashStart: number | null }

export type BandElements = Pick<Elements['terminal'], 'Box' | 'Text'>

/** The art the band draws above its line: only the Crystal sprite animates; null is the line alone. */
export function bandArt(view: BandView, maxRows: number, columns: number): Art | null {
  return view.showFull ? pickArt(species(view.save.species), maxRows, columns) : null
}

/** The rows of `art` as drawn at `view.now`: the sprite's current animation frame, or the still icon. */
export function artRows(view: BandView, art: Art): Run[][] {
  const sp = species(view.save.species)
  if (art === 'icon') return spriteRows(sp.icon, view.save.isShiny)
  return frameRows(sp, frameAt(sp.anim, sp.frames.px.length, view.now, view.flashStart), view.save.isShiny)
}

export function drawRows({ Box, Text }: BandElements, rows: Run[][]) {
  return rows.map((runs, y) => (
    <Box key={`r${y}`} flexDirection="row">
      {runs.map((r, x) => <Text key={`c${y}-${x}`} color={r.fg} backgroundColor={r.bg}>{r.text}</Text>)}
    </Box>
  ))
}

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
  const art = bandArt(view, maxRows, columns)
  if (art === null) return line
  return (
    <Box flexDirection="column">
      {drawRows(els, artRows(view, art))}
      {line}
    </Box>
  )
}
