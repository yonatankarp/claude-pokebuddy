import { base64Decode } from '../codec'
import { species } from '../data/dex'
import type { PokemonType, Species, Sprite } from '../data/types'
import { expForLevel, MAX_LEVEL } from '../exp'
import type { Save } from '../state'

export type Run = { text: string; fg?: string; bg?: string }

const decodeCache = new Map<string, number[]>()
function pixels({ px, w, h }: Sprite): number[] {
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

/** Rects for rows `from` to `to` of the sprite, one per same-colour horizontal run. */
function spriteRects(sprite: Sprite, isShiny: boolean, from = 0, to = sprite.h): string {
  const { w } = sprite
  const indexes = pixels(sprite)
  const pal = isShiny ? sprite.shiny : sprite.palette
  const rects: string[] = []
  for (let y = from; y < to; y++) {
    for (let x = 0; x < w;) {
      const k = indexes[y * w + x] ?? 0
      let end = x + 1
      while (end < w && indexes[y * w + end] === k) end++
      const fill = k === 0 ? '' : (pal[k] ?? '')
      if (fill) rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${fill}"/>`)
      x = end
    }
  }
  return rects.join('')
}

/** The sprite as SVG markup, one rect per same-colour horizontal run, for surfaces that draw `Svg`. */
export function spriteSvg(sprite: Sprite, isShiny: boolean): string {
  const { w, h } = sprite
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">${spriteRects(sprite, isShiny)}</svg>`
}

// The idle loop, a quarter second a step, mostly rest: [steps, turned, hop, lean, breath] in whole pixels.
const IDLE: [number, 0 | 1, number, number, number][] = [
  [6, 0, 0, 0, 0], [2, 0, 0, 0, 1], [4, 0, 0, 0, 0], [2, 0, 0, 0, 1], [3, 0, 0, 0, 0],
  [2, 0, 0, -1, 0], [1, 0, 0, 0, 0], [2, 0, 0, 1, 0], [2, 0, 0, 0, 0],
  [1, 0, -2, 0, 0], [1, 0, 0, 0, 1], [2, 0, 0, 0, 0],
  [4, 1, 0, 0, 0], [1, 1, 0, 0, 1], [3, 0, 0, 0, 0],
]
const IDLE_STEP = 0.25
const IDLE_STEPS = IDLE.reduce((n, [steps]) => n + steps, 0)
/** Clear pixels around the idle sprite: one each side for the lean, two above for the hop. */
export const IDLE_MARGIN = { x: 1, top: 2 }

/** An `animateTransform` stepping through the idle loop, `value` naming each pose's transform. */
function idleMotion(type: 'translate' | 'scale', value: (pose: (typeof IDLE)[number]) => string, begin: number): string {
  let at = 0
  const keyTimes = IDLE.map(([steps]) => { const t = at / IDLE_STEPS; at += steps; return +t.toFixed(4) })
  return `<animateTransform attributeName="transform" type="${type}" calcMode="discrete" values="${IDLE.map(value).join(';')}"` +
    ` keyTimes="${keyTimes.join(';')}" dur="${IDLE_STEPS * IDLE_STEP}s" begin="-${begin}s" repeatCount="indefinite"/>`
}

/**
 * The sprite breathing, leaning, hopping and turning round, as SMIL a surface plays in an interactive Svg: the rows above
 * its waist move on their own, all in whole pixels so it stays crisp. Unanimated, as a still image, it is the plain sprite.
 * `seed` sets where in the loop it starts, so a box of them does not move as one.
 */
export function idleSpriteSvg(sprite: Sprite, isShiny: boolean, seed: number): string {
  const { w, h } = sprite
  const waist = Math.round(h * 0.6)
  const begin = +((seed * 1.37) % (IDLE_STEPS * IDLE_STEP)).toFixed(2)
  const { x: mx, top } = IDLE_MARGIN
  // A turn is a mirror about the sprite's middle: moved across its width, then flipped.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-mx} ${-top} ${w + 2 * mx} ${h + top}" width="${w + 2 * mx}" height="${h + top}" shape-rendering="crispEdges">` +
    `<g>${idleMotion('translate', ([, turned]) => `${turned * w} 0`, begin)}` +
    `<g>${idleMotion('scale', ([, turned]) => (turned ? '-1 1' : '1 1'), begin)}` +
    `<g>${idleMotion('translate', ([, , hop]) => `0 ${hop}`, begin)}` +
    `<g>${spriteRects(sprite, isShiny, waist, h)}</g>` +
    `<g>${idleMotion('translate', ([, , , lean, breath]) => `${lean} ${breath}`, begin)}${spriteRects(sprite, isShiny, 0, waist)}</g>` +
    '</g></g></g></svg>'
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
