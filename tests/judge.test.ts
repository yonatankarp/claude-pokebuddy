import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import { judge, judgePrompt, parseScore } from '../hooks/judge'

const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

// The test engine's `$` has no `model` noun, so the model is a fake client with the same `complete` shape.
const client = (complete: (r: ModelCompleteRequest) => ModelCompleteResult | Promise<ModelCompleteResult>) => ({ model: { complete: async (r: ModelCompleteRequest) => complete(r) } })

describe('judge', () => {
  test('parseScore takes the first integer 0 to 100', () => {
    expect(parseScore('SCORE: 72')).toBe(72)
    expect(parseScore('I would say 101')).toBe(100)
    expect(parseScore('no idea')).toBe(null)
    expect(parseScore('-5')).toBe(0)
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
