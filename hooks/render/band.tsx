import type { EngineInterface, Elements, RenderInput } from 'claude-code'
import { COMPACT_MIN_COLUMNS } from '../config'
import { species } from '../data/dex'
import type { Save } from '../state'
import { expBar, pickScale, spriteRows, TYPE_COLOR } from './sprite'

export type BandView = { save: Save; bubble: string | null; showFull: boolean; evolving: boolean; isFlash: boolean }

export type BandInput = RenderInput<'AbovePrompt', 'terminal'>

export function band(els: Elements['terminal'], view: BandView, maxRows: number, columns: number) {
  const { Box, Text } = els
  const { save } = view
  const sp = species(view.evolving && save.evolution ? save.evolution.to : save.species)
  const name = save.nickname ?? sp.name
  const typeColor = TYPE_COLOR[sp.types[0]!]
  const line = (
    <Box key="line" flexDirection="row">
      <Text color={typeColor}>◓ </Text>
      <Text bold>{view.evolving ? `What? ${species(save.species).name} is evolving!` : name}</Text>
      {save.isShiny && <Text color="#f8d030"> ★</Text>}
      <Text> Lv{save.level} </Text>
      <Text color={typeColor}>{expBar(save, 8)}</Text>
      {view.bubble && columns >= COMPACT_MIN_COLUMNS && <Text dimColor wrap="truncate-end"> │ “{view.bubble}”</Text>}
    </Box>
  )
  if (!view.showFull) return line
  const scale = pickScale(sp.sprite, maxRows, columns, view.isFlash)
  if (scale === null) return line
  const rows = spriteRows(sp.sprite, save.isShiny, scale)
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

export function Band(props: { $: EngineInterface; e: BandInput; view: BandView }) {
  const { $, e, view } = props
  return band($.ui.resolve(e), view, e.props.maxRows, e.props.bodyColumns)
}
