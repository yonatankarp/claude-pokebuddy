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

/** Cuts pokecrystal's front.png, a vertical strip of square frames (frame 0 on top), into RGBA frames. */
export function sliceFrames(rgba: Uint8Array, w: number, h: number): Uint8Array[] {
  if (h % w !== 0) throw new Error(`${w}x${h} is not a strip of square frames`)
  const size = w * w * 4
  return Array.from({ length: h / w }, (_, i) => rgba.slice(i * size, (i + 1) * size))
}

export type Pin = 'clear' | 'keep' | null

/**
 * front.png has an opaque white background. White is also a sprite colour (eyes, highlights), so only
 * the white 4-connected to the frame's border becomes transparent, as in PokeAPI's transparent sprites.
 * `fixed` pins pixels whose answer is known: `keep` stays opaque, `clear` turns transparent and spreads
 * to the unpinned white it touches.
 */
export function clearBorderWhite(rgba: Uint8Array, w: number, h: number, fixed: (p: number) => Pin = () => null): Uint8Array {
  const out = rgba.slice()
  const seen = new Uint8Array(w * h)
  const isWhite = (p: number) => out[p * 4]! === 255 && out[p * 4 + 1]! === 255 && out[p * 4 + 2]! === 255 && out[p * 4 + 3]! !== 0
  const stack: number[] = []
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
  for (let p = 0; p < w * h; p++) if (fixed(p) === 'clear') stack.push(p)
  while (stack.length) {
    const p = stack.pop()!
    if (seen[p]) continue
    const pin = fixed(p)
    if (pin === 'keep' || (pin === null && !isWhite(p))) continue
    seen[p] = 1
    out[p * 4 + 3] = 0
    const x = p % w, y = Math.floor(p / w)
    if (x > 0) stack.push(p - 1)
    if (x < w - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - w)
    if (y < h - 1) stack.push(p + w)
  }
  return out
}

/**
 * Where a square frame (its white background still opaque) sits inside a larger transparent reference
 * of the same art: the offset where the most of the frame's non-white pixels match the reference's colour.
 */
export function alignOffset(ref: Uint8Array, refSize: number, frame: Uint8Array, size: number): { x: number; y: number } {
  let best = { x: 0, y: 0 }, bestScore = -1
  for (let oy = 0; oy + size <= refSize; oy++) for (let ox = 0; ox + size <= refSize; ox++) {
    let score = 0
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, j = ((y + oy) * refSize + x + ox) * 4
      if (frame[i] === 255 && frame[i + 1] === 255 && frame[i + 2] === 255) continue
      if (ref[j + 3]! >= 128 && ref[j] === frame[i] && ref[j + 1] === frame[i + 1] && ref[j + 2] === frame[i + 2]) score++
    }
    if (score > bestScore) { bestScore = score; best = { x: ox, y: oy } }
  }
  return best
}

/**
 * Indexes square RGBA frames against an existing palette (index 0 transparent), each opaque pixel taking
 * the nearest colour, all frames cropped to the one box that holds every frame's opaque pixels, so
 * they stay aligned when swapped.
 */
export function indexFrames(frames: readonly Uint8Array[], size: number, palette: readonly string[]): { w: number; h: number; frames: number[][] } {
  let minX = size, minY = size, maxX = -1, maxY = -1
  for (const f of frames) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (f[(y * size + x) * 4 + 3]! >= 128) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) throw new Error('frames are fully transparent')
  const colours = palette.map(c => (c ? rgb(c) : null))
  const nearest = (r: number, g: number, b: number) => {
    let best = 1, bestD = Infinity
    colours.forEach((c, k) => {
      if (!c) return
      const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2
      if (d < bestD) { bestD = d; best = k }
    })
    return best
  }
  const out = frames.map(f => {
    const indexes: number[] = []
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const i = (y * size + x) * 4
      indexes.push(f[i + 3]! < 128 ? 0 : nearest(f[i]!, f[i + 1]!, f[i + 2]!))
    }
    return indexes
  })
  return { w: maxX - minX + 1, h: maxY - minY + 1, frames: out }
}

/**
 * The frames of a front.png strip with their background cleared. Pixels a frame shares with frame 0
 * take their transparency from the reference (PokeAPI's transparent sprite of frame 0), which knows the
 * enclosed background and the white touching the border; pixels a frame changes fall back to the fill.
 */
export function clearFrames(strip: Uint8Array, w: number, h: number, ref: Uint8Array, refSize: number): Uint8Array[] {
  const frames = sliceFrames(strip, w, h)
  const base = frames[0]!
  const off = alignOffset(ref, refSize, base, w)
  return frames.map(f => clearBorderWhite(f, w, w, p => {
    const i = p * 4
    if (f[i] !== base[i] || f[i + 1] !== base[i + 1] || f[i + 2] !== base[i + 2]) return null
    const j = ((Math.floor(p / w) + off.y) * refSize + (p % w) + off.x) * 4
    return ref[j + 3]! < 128 ? 'clear' : 'keep'
  }))
}
