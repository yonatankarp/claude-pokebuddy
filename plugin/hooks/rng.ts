export function sfc32(seed: readonly number[]): () => number {
  let [a, b, c, d] = [seed[0] ?? 0, seed[1] ?? 0, seed[2] ?? 0, seed[3] ?? 0].map(n => n >>> 0) as [number, number, number, number]
  const next = () => {
    const t = (((a + b) >>> 0) + d) >>> 0
    d = (d + 1) >>> 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) >>> 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) >>> 0
    return t / 4294967296
  }
  for (let i = 0; i < 12; i++) next()
  return next
}
