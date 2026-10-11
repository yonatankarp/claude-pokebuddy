const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]))

export function base64Encode(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1], c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!
    out += b === undefined ? '=' : ALPHABET[(n >> 6) & 63]!
    out += c === undefined ? '=' : ALPHABET[n & 63]!
  }
  return out
}

export function base64Decode(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '')
  const out: number[] = []
  let buf = 0, bits = 0
  for (const ch of clean) {
    const v = LOOKUP.get(ch)
    if (v === undefined) throw new Error(`invalid base64 character: ${ch}`)
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 255)
    }
  }
  return new Uint8Array(out)
}

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)
export const fromUtf8 = (b: Uint8Array): string => new TextDecoder().decode(b)

export function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (const byte of utf8(s)) {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Run-length codes 4-bit values: one byte per run of up to 16, the run length less one high, the value low. */
export function rleEncode(nibbles: readonly number[]): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < nibbles.length;) {
    let j = i + 1
    while (j < nibbles.length && j - i < 16 && nibbles[j] === nibbles[i]) j++
    out.push(((j - i - 1) << 4) | nibbles[i]!)
    i = j
  }
  return new Uint8Array(out)
}

export function rleDecode(bytes: Uint8Array): number[] {
  const out: number[] = []
  for (const b of bytes) for (let n = (b >> 4) + 1; n > 0; n--) out.push(b & 15)
  return out
}
