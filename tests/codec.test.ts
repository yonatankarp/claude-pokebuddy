import { describe, expect, test } from 'claude-code/testing'
import { base64Decode, base64Encode, fnv1a, fromUtf8, rleDecode, rleEncode, utf8 } from '../hooks/codec'

describe('codec', () => {
  test('base64 round-trips every byte value', () => {
    const bytes = new Uint8Array(256).map((_, i) => i)
    expect(Array.from(base64Decode(base64Encode(bytes)))).toEqual(Array.from(bytes))
  })
  test('base64 matches the RFC 4648 vectors', () => {
    expect(base64Encode(utf8('foobar'))).toBe('Zm9vYmFy')
    expect(base64Encode(utf8('fooba'))).toBe('Zm9vYmE=')
    expect(base64Encode(utf8('foob'))).toBe('Zm9vYg==')
    expect(fromUtf8(base64Decode('Zm9vYg=='))).toBe('foob')
  })
  test('utf8 keeps non-ASCII names', () => {
    expect(fromUtf8(utf8('Nidoran♀ é'))).toBe('Nidoran♀ é')
  })
  test('fnv1a is stable and 8 hex chars', () => {
    expect(fnv1a('')).toBe('811c9dc5')
    expect(fnv1a('a')).toBe('e40c292c')
  })
  test('rle packs each run of up to 16 equal nibbles into one byte, count less one high', () => {
    expect(Array.from(rleEncode([0, 0, 0, 5, 7, 7]))).toEqual([0x20, 0x05, 0x17])
    expect(Array.from(rleEncode(new Array(17).fill(3)))).toEqual([0xf3, 0x03])
    expect(Array.from(rleEncode([]))).toEqual([])
  })
  test('rle round-trips', () => {
    const nibbles = Array.from({ length: 300 }, (_, i) => (i % 37 < 20 ? 0 : (i * 7) % 16))
    expect(rleDecode(rleEncode(nibbles))).toEqual(nibbles)
  })
})
