import { base64Decode, rleDecode } from '../codec'
import { species } from '../data/dex'
import type { PokemonType, Species, Sprite } from '../data/types'
import { expForLevel, MAX_LEVEL } from '../exp'
import type { Save } from '../state'

export type Run = { text: string; fg?: string; bg?: string }

type Pixels = { w: number; h: number; indexes: readonly number[] }

const decodeCache = new Map<string, number[]>()
function cached(px: string, w: number, h: number, decode: (bytes: Uint8Array) => number[]): Pixels {
  let out = decodeCache.get(px)
  if (!out) {
    out = decode(base64Decode(px))
    out.length = w * h
    decodeCache.set(px, out)
  }
  return { w, h, indexes: out }
}
const nibbles = (bytes: Uint8Array) => Array.from(bytes).flatMap(b => [b >> 4, b & 15])

/** Terminal cells the art takes at 1:1: one column per pixel, two pixel rows per text row. */
export function spriteSize(art: { w: number; h: number }) {
  return { rows: Math.ceil(art.h / 2), cols: art.w }
}

function rowsOf({ w, h, indexes }: Pixels, pal: readonly string[]): Run[][] {
  const at = (x: number, y: number): string => {
    if (y >= h) return ''
    const k = indexes[y * w + x] ?? 0
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

/** Half-block rows of a still sprite. */
export function spriteRows(sprite: Sprite, isShiny: boolean): Run[][] {
  return rowsOf(cached(sprite.px, sprite.w, sprite.h, nibbles), isShiny ? sprite.shiny : sprite.palette)
}

/** Half-block rows of one Crystal animation frame, in the sprite's palette. */
export function frameRows(sp: Species, frame: number, isShiny: boolean): Run[][] {
  const { w, h, px } = sp.frames
  return rowsOf(cached(px[frame] ?? px[0]!, w, h, rleDecode), isShiny ? sp.sprite.shiny : sp.sprite.palette)
}

/** `sprite` is the animated Crystal sprite, `icon` the still menu icon. */
export type Art = 'sprite' | 'icon'

export function artSize(sp: Species, art: Art) {
  return spriteSize(art === 'sprite' ? sp.frames : sp.icon)
}

/** The art that fits in `rows` x `columns`, never scaled: the Crystal sprite, else the menu icon, else none. */
export function fitArt(sp: Species, rows: number, columns: number): Art | null {
  for (const art of ['sprite', 'icon'] as const) {
    const size = artSize(sp, art)
    if (size.rows <= rows && size.cols <= columns) return art
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
