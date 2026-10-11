import { describe, expect, test } from 'claude-code/testing'
import { sfc32 } from '../hooks/rng'

describe('sfc32', () => {
  test('same seed, same sequence', () => {
    const a = sfc32([1, 2, 3, 4])
    const b = sfc32([1, 2, 3, 4])
    for (let i = 0; i < 10; i++) expect(a()).toBe(b())
  })
  test('values stay in [0, 1) and average near 0.5', () => {
    const r = sfc32([9, 8, 7, 6])
    let sum = 0
    for (let i = 0; i < 10000; i++) {
      const v = r()
      expect(v >= 0 && v < 1).toBe(true)
      sum += v
    }
    expect(Math.abs(sum / 10000 - 0.5) < 0.02).toBe(true)
  })
})
