export type Indexed = { w: number; h: number; indexes: number[]; palette: string[] }

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')

export function cropAndIndex(rgba: Uint8Array, w: number, h: number): Indexed {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3]! >= 128) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) throw new Error('sprite is fully transparent')
  const palette = ['']
  const indexes: number[] = []
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const i = (y * w + x) * 4
    if (rgba[i + 3]! < 128) { indexes.push(0); continue }
    const c = hex(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!)
    let k = palette.indexOf(c)
    if (k < 0) {
      palette.push(c)
      k = palette.length - 1
      if (k > 15) throw new Error('sprite has more than 15 colours')
    }
    indexes.push(k)
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1, indexes, palette }
}

export function packNibbles(indexes: readonly number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(indexes.length / 2))
  indexes.forEach((v, i) => {
    out[i >> 1]! |= i % 2 === 0 ? v << 4 : v
  })
  return out
}

/** Shiny palette for the same pixels: map each normal colour to the shiny sprite's colour at the same first position. */
export function shinyPalette(normal: Indexed, shinyRgba: Uint8Array, w: number, h: number, offsetX: number, offsetY: number): string[] {
  const out = normal.palette.map(() => '')
  normal.indexes.forEach((k, i) => {
    if (k === 0 || out[k] !== '') return
    const x = (i % normal.w) + offsetX, y = Math.floor(i / normal.w) + offsetY
    const j = (y * w + x) * 4
    out[k] = hex(shinyRgba[j]!, shinyRgba[j + 1]!, shinyRgba[j + 2]!)
  })
  return out
}

export function cropOffset(rgba: Uint8Array, w: number, h: number): { x: number; y: number } {
  let x0 = w, y0 = h
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3]! >= 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y) }
  }
  return { x: x0, y: y0 }
}

const rgb = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) as [number, number, number]

/**
 * A shiny palette for an icon that has no shiny art of its own: each icon colour takes the shiny shift
 * (shiny minus normal) of the nearest colour in the species' Crystal palette, clamped to 0..255.
 */
export function iconShinyPalette(icon: readonly string[], crystal: readonly string[], crystalShiny: readonly string[]): string[] {
  return icon.map((c, k) => {
    if (k === 0) return ''
    const [r, g, b] = rgb(c)
    let best = 1, bestD = Infinity
    for (let j = 1; j < crystal.length; j++) {
      const [cr, cg, cb] = rgb(crystal[j]!)
      const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
      if (d < bestD) { bestD = d; best = j }
    }
    const from = rgb(crystal[best]!), to = rgb(crystalShiny[best]!)
    const clamp = (v: number) => Math.max(0, Math.min(255, v))
    return hex(clamp(r + to[0] - from[0]), clamp(g + to[1] - from[1]), clamp(b + to[2] - from[2]))
  })
}
