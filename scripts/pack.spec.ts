import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alignOffset, clearBorderWhite, clearFrames, cropAndIndex, iconShinyPalette, indexFrames, packNibbles, sliceFrames } from './pack.ts'

test('packNibbles puts two pixels per byte, high nibble first', () => {
  assert.deepEqual(Array.from(packNibbles([1, 2, 3])), [0x12, 0x30])
})

test('cropAndIndex crops transparent borders and indexes colours, 0 transparent', () => {
  // 4x3 RGBA: one opaque red pixel at (1,1), one blue at (2,1)
  const w = 4, h = 3
  const rgba = new Uint8Array(w * h * 4)
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * w + x) * 4
    rgba.set([r, g, b, 255], i)
  }
  set(1, 1, 255, 0, 0)
  set(2, 1, 0, 0, 255)
  const out = cropAndIndex(rgba, w, h)
  assert.equal(out.w, 2)
  assert.equal(out.h, 1)
  assert.deepEqual(out.indexes, [1, 2])
  assert.deepEqual(out.palette, ['', '#ff0000', '#0000ff'])
})

test('cropAndIndex refuses more than 15 colours', () => {
  const w = 16, h = 1
  const rgba = new Uint8Array(w * h * 4)
  for (let x = 0; x < 16; x++) rgba.set([x * 10, 0, 0, 255], x * 4)
  assert.throws(() => cropAndIndex(rgba, w, h), /more than 15 colours/)
})

test('iconShinyPalette shifts each icon colour by its nearest Crystal colour\'s shiny delta', () => {
  const crystal = ['', '#f80000', '#0000f8']
  const crystalShiny = ['', '#f8f800', '#00f8f8']
  // near red: +248 green; near blue: +248 green; clamped at 255
  assert.deepEqual(iconShinyPalette(['', '#e01010', '#1010e0', '#10f010'], crystal, crystalShiny), ['', '#e0ff10', '#10ffe0', '#10ff10'])
})

test('iconShinyPalette keeps index 0 transparent and ignores it when matching', () => {
  assert.deepEqual(iconShinyPalette(['', '#000000'], ['', '#101010'], ['', '#202020']), ['', '#101010'])
})

const W = [255, 255, 255, 255], K = [0, 0, 0, 255], R = [248, 0, 0, 255]
const image = (rows: number[][][]) => new Uint8Array(rows.flat(2))

test('clearBorderWhite makes only the white reachable from the edge transparent, 4-connected', () => {
  // A black ring holding white inside; the corner gap is diagonal only, so the inside stays white.
  const rgba = image([
    [W, W, W, W],
    [W, K, K, W],
    [W, K, W, K],
    [W, W, K, W],
  ])
  const out = clearBorderWhite(rgba, 4, 4)
  const alpha = (x: number, y: number) => out[(y * 4 + x) * 4 + 3]
  assert.equal(alpha(0, 0), 0)
  assert.equal(alpha(3, 3), 0)
  assert.equal(alpha(1, 1), 255)
  assert.equal(alpha(2, 2), 255)
})

test('sliceFrames cuts a vertical strip into square frames', () => {
  const strip = image([[R, W], [W, R], [K, K], [W, W]])
  const frames = sliceFrames(strip, 2, 4)
  assert.equal(frames.length, 2)
  assert.deepEqual(Array.from(frames[1]!), [...K, ...K, ...W, ...W])
  assert.throws(() => sliceFrames(strip, 2, 3), /not a strip of square frames/)
})

test('indexFrames crops every frame to one union box and maps to the nearest palette colour', () => {
  const T = [255, 255, 255, 0], NEAR_RED = [240, 8, 0, 255]
  const a = image([[T, T, T], [T, R, T], [T, T, T]])
  const b = image([[T, T, T], [T, T, K], [T, T, NEAR_RED]])
  const out = indexFrames([a, b], 3, ['', '#000000', '#f80000'])
  assert.equal(out.w, 2)
  assert.equal(out.h, 2)
  assert.deepEqual(out.frames, [[2, 0, 0, 0], [0, 1, 0, 2]])
})

test('clearBorderWhite honours fixed pixels: kept ones stay, cleared ones seed the fill', () => {
  const rgba = image([
    [W, W, K, W, W],
    [K, K, K, K, K],
    [K, W, W, K, W],
    [K, K, K, K, W],
    [W, W, W, W, W],
  ])
  const alpha = (out: Uint8Array, x: number, y: number) => out[(y * 5 + x) * 4 + 3]
  // Pinned: (0,0) opaque although on the border; (1,2) clear, taking its enclosed white neighbour (2,2).
  const fixed = (p: number) => (p === 0 ? 'keep' : p === 11 ? 'clear' : null)
  const out = clearBorderWhite(rgba, 5, 5, fixed)
  assert.deepEqual([alpha(out, 0, 0), alpha(out, 1, 0), alpha(out, 1, 2), alpha(out, 2, 2), alpha(out, 4, 2)], [255, 0, 0, 0, 0])
  assert.equal(alpha(clearBorderWhite(rgba, 5, 5), 2, 2), 255)
})

test('alignOffset finds where a frame sits inside the 56x56 PokeAPI canvas', () => {
  const T = [0, 0, 0, 0]
  const ref = image([[T, T, T, T], [T, T, R, K], [T, T, K, R], [T, T, T, T]])
  const frame = image([[R, K], [K, R]])
  assert.deepEqual(alignOffset(ref, 4, frame, 2), { x: 2, y: 1 })
})

test('clearFrames takes frame 0\'s transparency from the reference and fills only what a frame changed', () => {
  const T = [0, 0, 0, 0]
  // Reference: a 3x3 canvas holding the 2x2 art at (1,1); its top-left white is art, its bottom-right background.
  const ref = image([[T, T, T], [T, W, K], [T, K, T]])
  // Frame 0 is the art; frame 1 turns the bottom-right pixel black, which then is art.
  const strip = image([[W, K], [K, W], [W, K], [K, K]])
  const [f0, f1] = clearFrames(strip, 2, 4, ref, 3)
  const alpha = (f: Uint8Array) => [0, 1, 2, 3].map(p => f[p * 4 + 3])
  assert.deepEqual(alpha(f0!), [255, 255, 255, 0])
  assert.deepEqual(alpha(f1!), [255, 255, 255, 255])
})

test('clearFrames clears frame 0\'s white art in a later frame that moved away from it, keeps it where it stayed', () => {
  const T = [0, 0, 0, 0]
  // Frame 0: white art (2,2) inside a black ring. Frame 1: the ring's top is gone, so the white left at
  // (2,2) is background reached from the border, not art. Frame 2 is frame 0 again.
  const f0 = [[W, W, W, W, W], [W, K, K, K, W], [W, K, W, K, W], [W, K, K, K, W], [W, W, W, W, W]]
  const f1 = [[W, W, W, W, W], [W, W, W, W, W], [W, K, W, K, W], [W, K, K, K, W], [W, W, W, W, W]]
  const ref = image([[T, T, T, T, T], [T, K, K, K, T], [T, K, W, K, T], [T, K, K, K, T], [T, T, T, T, T]])
  const [, one, two] = clearFrames(image([...f0, ...f1, ...f0]), 5, 15, ref, 5)
  const alpha = (f: Uint8Array, x: number, y: number) => f[(y * 5 + x) * 4 + 3]
  assert.equal(alpha(one!, 2, 2), 0)
  assert.equal(alpha(one!, 1, 2), 255)
  assert.equal(alpha(two!, 2, 2), 255)
})

test('clearFrames clears the white of a dither a later frame fades into, keeps a lone new white pixel', () => {
  const T = [0, 0, 0, 0]
  // Frame 0: a solid black block. Frame 1 fades its bottom into a black and white checker, whose white
  // touches the background only corner to corner. Another frame 1 opens a lone white glint instead.
  const f0 = [[W, W, W, W, W], [W, K, K, K, W], [W, K, K, K, W], [W, K, K, K, W], [W, W, W, W, W]]
  const ditherF1 = [[W, W, W, W, W], [W, K, K, K, W], [W, K, W, K, W], [W, W, K, W, W], [W, W, W, W, W]]
  const ref = image([[T, T, T, T, T], [T, K, K, K, T], [T, K, K, K, T], [T, K, K, K, T], [T, T, T, T, T]])
  const alpha = (f: Uint8Array, x: number, y: number) => f[(y * 5 + x) * 4 + 3]
  // The checker: (2,2) is white with black on all four sides, its corners (1,3) and (3,3) white background.
  const [, dither] = clearFrames(image([...f0, ...ditherF1]), 5, 10, ref, 5)
  assert.equal(alpha(dither!, 2, 2), 0)
  assert.equal(alpha(dither!, 2, 3), 255)
  // The glint (2,2) has black on all four sides and at all four corners: it stays.
  const glint = [[W, W, W, W, W], [W, K, K, K, W], [W, K, W, K, W], [W, K, K, K, W], [W, W, W, W, W]]
  const [, kept] = clearFrames(image([...f0, ...glint]), 5, 10, ref, 5)
  assert.equal(alpha(kept!, 2, 2), 255)
})
