import { describe, expect, test } from 'claude-code/testing'
import type { Save } from '../types'
import type { Stone } from '../hooks/data/types'
import { PERSONALITIES, type Personality } from '../hooks/roll'
import { SOURCES, type Source } from '../hooks/tally'

// types/index.d.ts cannot import, so it spells these lists itself; `npx tsc -p .` fails here if they drift.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
const personality: Equal<Save['personality'], Personality> = true
const sources: Equal<keyof Save['expBySource'], Source> = true
const stones: Equal<keyof Save['bag'], Stone> = true

describe('types', () => {
  test('the Save mirror spells the same personalities, EXP sources and stones as the hooks', () => {
    expect([personality, sources, stones]).toEqual([true, true, true])
    expect(PERSONALITIES).toHaveLength(8)
    expect(SOURCES).toHaveLength(9)
  })
})
