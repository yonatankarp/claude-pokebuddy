import { base64Decode } from '../codec'
import { species } from '../data/dex'
import type { PokemonType, Sprite } from '../data/types'
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

export function spriteSize(sprite: Sprite, scale: 1 | 2) {
  const w = Math.ceil(sprite.w / scale), h = Math.ceil(sprite.h / scale)
  return { rows: Math.ceil(h / 2), cols: w }
}

export function spriteRows(sprite: Sprite, isShiny: boolean, scale: 1 | 2): Run[][] {
  const px = indexes(sprite)
  const pal = isShiny ? sprite.shiny : sprite.palette
  const w = Math.ceil(sprite.w / scale), h = Math.ceil(sprite.h / scale)
  const at = (x: number, y: number): string => {
    if (y >= h) return ''
    const k = px[y * scale * sprite.w + x * scale] ?? 0
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

/** Rows reserved below the sprite: the one-row compact line plus one spare row so the band never fills maxRows exactly. */
const CHROME_ROWS = 2

export function pickScale(sprite: Sprite, maxRows: number, columns: number, isFlash: boolean): 1 | 2 | null {
  const scales: (1 | 2)[] = isFlash ? [2] : [1, 2]
  for (const scale of scales) {
    const { rows, cols } = spriteSize(sprite, scale)
    if (rows + CHROME_ROWS <= maxRows && cols <= columns) return scale
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
