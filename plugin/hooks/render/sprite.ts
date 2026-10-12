import { base64Decode } from '../codec'
import { species } from '../data/dex'
import type { Idle, PokemonType, Species, Sprite } from '../data/types'
import { expForLevel, MAX_LEVEL } from '../exp'
import type { Save } from '../state'

export type Run = { text: string; fg?: string; bg?: string }

const decodeCache = new Map<string, number[]>()
function pixels({ px, w, h }: Pick<Sprite, 'px' | 'w' | 'h'>): number[] {
  let out = decodeCache.get(px)
  if (!out) {
    out = Array.from(base64Decode(px)).flatMap(b => [b >> 4, b & 15])
    out.length = w * h
    decodeCache.set(px, out)
  }
  return out
}

/** Terminal cells the art takes at 1:1: one column per pixel, two pixel rows per text row. */
export function spriteSize(art: { w: number; h: number }) {
  return { rows: Math.ceil(art.h / 2), cols: art.w }
}

/** Half-block rows of a sprite: one column per pixel, two pixel rows per text row. */
export function spriteRows(sprite: Sprite, isShiny: boolean): Run[][] {
  const { w, h } = sprite
  const indexes = pixels(sprite)
  const pal = isShiny ? sprite.shiny : sprite.palette
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

/** One frame of the idle as one path per colour, a one-pixel-tall box per run: far shorter markup than a rect per run. */
function framePaths(idle: Idle, frame: string, isShiny: boolean): string {
  const { w, h } = idle
  const indexes = pixels({ w, h, px: frame })
  const pal = isShiny ? idle.shiny : idle.palette
  const runs = new Map<string, string>()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w;) {
      const k = indexes[y * w + x] ?? 0
      let end = x + 1
      while (end < w && indexes[y * w + end] === k) end++
      const fill = k === 0 ? '' : (pal[k] ?? '')
      if (fill) runs.set(fill, `${runs.get(fill) ?? ''}M${x} ${y}h${end - x}v1h${x - end}z`)
      x = end
    }
  }
  return [...runs].map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join('')
}

/** Idle pixels tall that still draw at the full scale; a taller idle is drawn smaller, so a Gyarados fits. */
export const IDLE_FIT = 28
/** Whole CSS pixels per idle pixel at `scale`, the size an icon is drawn at: smaller for a tall idle, never blurred. */
export const idleScale = (idle: Idle, scale: number) => Math.max(1, Math.floor(scale * IDLE_FIT / Math.max(idle.h, IDLE_FIT)))

// Now and then it turns to look the other way: seconds of the turn's loop, and the part of it spent turned.
const TURN_LOOP = 9
const TURNED = [0.7, 0.85]

/**
 * The idle as SMIL a surface plays in an interactive Svg: each frame shown for its own time, the first one alone when
 * nothing plays it, and every TURN_LOOP seconds a look the other way. `seed` sets where in both loops it starts, so a
 * box of them does not move as one.
 */
export function idleSvg(idle: Idle, isShiny: boolean, seed: number): string {
  const { w, h, frames, durations } = idle
  const loop = durations.reduce((a, b) => a + b, 0) / 60
  const repeat = (begin: number, period: number) => `dur="${+period.toFixed(3)}s" begin="-${+((seed * begin) % period).toFixed(2)}s" repeatCount="indefinite"`
  let at = 0
  const shown = frames.map((frame, f) => {
    const from = at / 60, to = (at += durations[f]!) / 60
    const times = [0, from / loop, to / loop].map(t => +t.toFixed(4))
    // Discrete steps: hidden until its turn, shown for its duration, hidden after; the first one starts shown.
    const steps = f === 0 ? { values: 'visible;hidden', keyTimes: `0;${times[2]}` } : { values: 'hidden;visible;hidden', keyTimes: times.join(';') }
    const animate = frames.length > 1
      ? `<animate attributeName="visibility" calcMode="discrete" values="${steps.values}" keyTimes="${steps.keyTimes}" ${repeat(0.37, loop)}/>`
      : ''
    return `<g visibility="${f === 0 ? 'visible' : 'hidden'}">${animate}${framePaths(idle, frame, isShiny)}</g>`
  })
  // A turn is a mirror about the sprite's middle: moved across its width, then flipped.
  const turn = (type: string, still: string, turned: string) =>
    `<animateTransform attributeName="transform" type="${type}" calcMode="discrete" values="${still};${turned};${still}" keyTimes="0;${TURNED.join(';')}" ${repeat(1.37, TURN_LOOP)}/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">` +
    `<g>${turn('translate', '0 0', `${w} 0`)}<g>${turn('scale', '1 1', '-1 1')}${shown.join('')}</g></g></svg>`
}

/** Hand-drawn pixel art as SVG markup: one string per row, one character per pixel, `colors` naming each; other characters are clear. */
export function pixelArtSvg(rows: string[], colors: Record<string, string>): string {
  const w = Math.max(...rows.map(r => r.length)), h = rows.length
  const rects = rows.flatMap((row, y) => [...row.matchAll(/(.)\1*/g)].flatMap(m =>
    colors[m[1]!] ? [`<rect x="${m.index}" y="${y}" width="${m[0].length}" height="1" fill="${colors[m[1]!]}"/>`] : []))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}

/** The menu icon's size at 1:1. */
export function artSize(sp: Species) {
  return spriteSize(sp.icon)
}

/** Whether the icon fits in `rows` x `columns`, never scaled. */
export function fitArt(sp: Species, rows: number, columns: number): boolean {
  const size = artSize(sp)
  return size.rows <= rows && size.cols <= columns
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
