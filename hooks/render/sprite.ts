import { base64Decode } from '../codec'
import { species } from '../data/dex'
import type { PokemonType, Species, Sprite } from '../data/types'
import { expForLevel, MAX_LEVEL } from '../exp'
import type { Save } from '../state'

export type Run = { text: string; fg?: string; bg?: string }

const decodeCache = new Map<string, number[]>()
function indexes(sprite: Sprite): number[] {
  const hit = decodeCache.get(sprite.px)
  if (hit) return hit
  const bytes = base64Decode(sprite.px)
  const out: number[] = []
  for (const b of bytes) out.push(b >> 4, b & 15)
  out.length = sprite.w * sprite.h
  decodeCache.set(sprite.px, out)
  return out
}

/**
 * Terminal cells the sprite takes at 1:1: one column per pixel, two pixel rows per text row, plus the
 * one pixel row the idle bob moves through, so both frames are the same height.
 */
export function spriteSize(sprite: Sprite) {
  return { rows: Math.ceil((sprite.h + 1) / 2), cols: sprite.w }
}

/** Half-block rows of the art; `frame` 1 is the idle bob: the art one pixel row lower. */
export function spriteRows(sprite: Sprite, isShiny: boolean, frame: 0 | 1 = 0): Run[][] {
  const px = indexes(sprite)
  const pal = isShiny ? sprite.shiny : sprite.palette
  const w = sprite.w, h = sprite.h + 1
  const at = (x: number, y: number): string => {
    const src = y - frame
    if (y >= h || src < 0 || src >= sprite.h) return ''
    const k = px[src * w + x] ?? 0
    return k === 0 ? '' : (pal[k] ?? '')
  }
  const rows: Run[][] = []
  for (let y = 0; y < h; y += 2) {
    const runs: Run[] = []
    for (let x = 0; x < w; x++) {
      const top = at(x, y), bottom = at(x, y + 1)
      const cell: Run = top && bottom ? { text: '▀', fg: top, bg: bottom }
        : top ? { text: '▀', fg: top }
        : bottom ? { text: '▄', fg: bottom }
        : { text: ' ' }
      const last = runs[runs.length - 1]
      if (last && last.fg === cell.fg && last.bg === cell.bg && last.text[0] === cell.text) last.text += cell.text
      else runs.push(cell)
    }
    rows.push(runs)
  }
  return rows
}

export type Art = 'sprite' | 'icon'

/** The art to draw above the one-row compact line, never scaled: the Crystal sprite, else the menu icon, else none. */
export function pickArt(sp: Species, maxRows: number, columns: number): Art | null {
  for (const art of ['sprite', 'icon'] as const) {
    const { rows, cols } = spriteSize(sp[art])
    if (rows + 1 <= maxRows && cols <= columns) return art
  }
  return null
}

export const TYPE_COLOR: Record<PokemonType, string> = {
  normal: '#a8a878', fire: '#f08030', water: '#6890f0', electric: '#f8d030', grass: '#78c850', ice: '#98d8d8',
  fighting: '#c03028', poison: '#a040a0', ground: '#e0c068', flying: '#a890f0', psychic: '#f85888', bug: '#a8b820',
  rock: '#b8a038', ghost: '#705898', dragon: '#7038f8', steel: '#b8b8d0', fairy: '#ee99ac', dark: '#705848',
}

export function expBar(save: Save, width: number): string {
  if (save.level >= MAX_LEVEL) return '▰'.repeat(width)
  const g = species(save.species).growth
  const lo = expForLevel(g, save.level), hi = expForLevel(g, save.level + 1)
  const filled = Math.max(0, Math.min(width, Math.floor(((save.exp - lo) / (hi - lo)) * width)))
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}
