import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cropAndIndex, packNibbles } from './pack.ts'

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
