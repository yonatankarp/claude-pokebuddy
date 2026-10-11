import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import { LOG_LINE_MAX } from '../hooks/config'
import { judge, judgePrompt, parseLine, parseScore, STALE_MS, tagLine, takeEnded } from '../hooks/judge'

const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

// The test engine's `$` has no `model` noun, so the model is a fake client with the same `complete` shape.
const client = (complete: (r: ModelCompleteRequest) => ModelCompleteResult | Promise<ModelCompleteResult>) => ({ model: { complete: async (r: ModelCompleteRequest) => complete(r) } })

describe('judge', () => {
  test('parseScore prefers a whole-reply integer, else the last integer 0 to 100', () => {
    expect(parseScore(' 72 ')).toBe(72)
    expect(parseScore('-5')).toBe(0)
    expect(parseScore('250')).toBe(100)
    expect(parseScore('SCORE: 72')).toBe(72)
    expect(parseScore('Out of 100, I give it 65')).toBe(65)
    expect(parseScore('3 commits and 2 pushes: 80')).toBe(80)
    expect(parseScore('I would say 101')).toBe(null)
    expect(parseScore('no idea')).toBe(null)
  })
  test('parseScore reads a score out of 100 as the score', () => {
    expect(parseScore('72/100')).toBe(72)
    expect(parseScore('72 / 100')).toBe(72)
    expect(parseScore('72 out of 100')).toBe(72)
    expect(parseScore('Score: 72 out of 100.')).toBe(72)
    expect(parseScore('100/100')).toBe(100)
  })
  test('log lines: the new form, an older tagged one and an untagged one', () => {
    expect(parseLine('S1\t1700\t1 prompt')).toEqual({ sid: 'S1', ms: 1700, facts: '1 prompt' })
    expect(parseLine('S1\t1 prompt')).toEqual({ sid: 'S1', ms: null, facts: '1 prompt' })
    expect(parseLine('plain line')).toEqual({ sid: '', ms: null, facts: 'plain line' })
  })
  test('takeEnded: ended, untimed and day-old sessions go; running ones and this one stay', () => {
    const now = 10 * STALE_MS
    const log = ['A\t' + now + '\ta', 'B\t' + now + '\tb', 'OLD\tc', 'plain', 'GONE\t' + (now - STALE_MS - 1) + '\td', 'ME\te', 'ME\t' + now + '\tf']
    expect(takeEnded(log, ['A', 'ME'], 'ME', now)).toEqual({ taken: ['a', 'c', 'plain', 'd'], log: [log[1], log[5], log[6]] })
  })
  test('a log line is one line and at most LOG_LINE_MAX long', () => {
    expect(tagLine('S1', 5, 'edited config: a\tb\nc')).toBe('S1\t5\tedited config: a b c')
    expect(tagLine('S1', 5, 'x'.repeat(1000))).toHaveLength(LOG_LINE_MAX)
  })
  test('prompt lists the log', () => {
    expect(judgePrompt(['1 prompt; 1 commit', 'a quiet turn'])).toContain('- 1 prompt; 1 commit')
  })
  test('judge returns null on an empty log without calling the model', async () => {
    let called = false
    const $ = client(() => { called = true; throw new Error('should not be called') })
    expect(await judge($, 'haiku', [])).toBe(null)
    expect(called).toBe(false)
  })
  test('judge returns null on a junk reply', async () => {
    const $ = client(() => ({ isAnswered: true, text: 'great session!', usage }))
    expect(await judge($, 'haiku', ['1 commit'])).toBe(null)
  })
  test('judge returns the parsed score', async () => {
    const $ = client(() => ({ isAnswered: true, text: '72', usage }))
    expect(await judge($, 'haiku', ['1 commit'])).toBe(72)
  })
  test('judge returns null when the model throws', async () => {
    const $ = client(() => { throw new Error('boom') })
    expect(await judge($, 'haiku', ['1 commit'])).toBe(null)
  })
})
