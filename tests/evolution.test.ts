import { describe, expect, test } from 'claude-code/testing'
import { levelEvolution, stoneEvolution, stonesEarned, tradeEvolution } from '../hooks/evolution'

const zero = { greens: 0, commits: 0, configEdits: 0, feedRun: 0 }

describe('evolution', () => {
  test('Charmander evolves at 16, not 15', () => {
    expect(levelEvolution(4, 15, null)).toBe(null)
    expect(levelEvolution(4, 16, null)).toBe(5)
    expect(levelEvolution(4, 30, null)).toBe(5)
  })
  test('a cancel holds only for the level it happened at', () => {
    expect(levelEvolution(4, 16, 16)).toBe(null)
    expect(levelEvolution(4, 17, 16)).toBe(5)
  })
  test('stones', () => {
    expect(stoneEvolution(25, 'thunder-stone')).toBe(26)
    expect(stoneEvolution(25, 'fire-stone')).toBe(null)
    expect(stoneEvolution(133, 'water-stone')).toBe(134)
    expect(stoneEvolution(133, 'fire-stone')).toBe(136)
    expect(stoneEvolution(4, 'fire-stone')).toBe(null)
  })
  test('trade needs level 36', () => {
    expect(tradeEvolution(64, 35)).toBe(null)
    expect(tradeEvolution(64, 36)).toBe(65)
    expect(tradeEvolution(4, 50)).toBe(null)
  })
  test('stones from milestone thresholds, repeating', () => {
    expect(stonesEarned(zero, { ...zero, greens: 9 })).toEqual([])
    expect(stonesEarned({ ...zero, greens: 9 }, { ...zero, greens: 10 })).toEqual(['thunder-stone'])
    expect(stonesEarned(zero, { ...zero, commits: 21 })).toEqual(['fire-stone', 'fire-stone'])
    expect(stonesEarned({ ...zero, feedRun: 6 }, { ...zero, feedRun: 7 })).toEqual(['leaf-stone'])
    expect(stonesEarned({ ...zero, configEdits: 19 }, { ...zero, configEdits: 20 })).toEqual(['water-stone'])
  })
})
