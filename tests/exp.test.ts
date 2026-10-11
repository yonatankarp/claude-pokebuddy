import { describe, expect, test } from 'claude-code/testing'
import { expForLevel, levelForExp } from '../hooks/exp'

describe('growth curves', () => {
  const cases: [Parameters<typeof expForLevel>[0], number, number][] = [
    ['fast', 5, 100], ['fast', 50, 100000], ['fast', 100, 800000],
    ['medium-fast', 5, 125], ['medium-fast', 50, 125000], ['medium-fast', 100, 1000000],
    ['medium-slow', 5, 135], ['medium-slow', 50, 117360], ['medium-slow', 100, 1059860],
    ['slow', 5, 156], ['slow', 50, 156250], ['slow', 100, 1250000],
  ]
  for (const [g, lv, exp] of cases) test(`${g} level ${lv} needs ${exp}`, () => expect(expForLevel(g, lv)).toBe(exp))
  test('level 1 needs 0 and medium-slow never goes negative', () => {
    expect(expForLevel('medium-slow', 1)).toBe(0)
    expect(expForLevel('medium-slow', 2) >= 0).toBe(true)
  })
  test('levelForExp inverts expForLevel and caps at 100', () => {
    expect(levelForExp('medium-fast', 124)).toBe(4)
    expect(levelForExp('medium-fast', 125)).toBe(5)
    expect(levelForExp('slow', 99999999)).toBe(100)
  })
})
