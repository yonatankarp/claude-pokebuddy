import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import { cleanReply, cry, speak, speechPrompt, turnFacts } from '../hooks/speech'
import { freshSave } from '../hooks/state'

const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

// The test engine's `$` has no `model` noun, so the model is a fake client with the same `complete` shape.
const client = (complete: (r: ModelCompleteRequest) => ModelCompleteResult | Promise<ModelCompleteResult>) => ({ model: { complete: async (r: ModelCompleteRequest) => complete(r) } })

describe('speech', () => {
  test('facts summarise without content', () => {
    expect(turnFacts([{ kind: 'tool' }, { kind: 'tool' }, { kind: 'commit' }, { kind: 'check', key: 'npm test', ok: false }, { kind: 'config', path: '/r/CLAUDE.md' }], 1))
      .toBe('1 prompt; 2 tool calls; 1 commit; checks: npm test failed; edited config: CLAUDE.md')
    expect(turnFacts([], 0)).toBe('a quiet turn')
  })
  test('facts pluralise pushes and PRs', () => {
    expect(turnFacts([{ kind: 'push' }, { kind: 'pr' }, { kind: 'pr' }], 0)).toBe('1 push; 2 PRs opened')
    expect(turnFacts([{ kind: 'pr' }], 0)).toBe('1 PR opened')
  })
  test('cry is built from the name', () => {
    expect(cry('PIKACHU', () => 0)).toMatch(/^Pika/)
    expect(cry('MR. MIME', () => 0)).toBe('Mr!')
    expect(cry("FARFETCH'D", () => 0)).toBe('Farf!')
    expect(cry('NIDORAN♀', () => 0)).toBe('Nido!')
  })
  test('prompt carries species, level and personality', () => {
    const s = freshSave([1, 2, 3, 4])
    const p = speechPrompt(s, 'a quiet turn')
    expect(p.prompt).toContain(`level ${s.level}`)
    expect(p.prompt).toContain(s.personality)
    expect(p.prompt).toContain('a quiet turn')
  })
  test('conversation: the prompt carries the asked and answered excerpts, each cut at 300 characters', () => {
    const s = freshSave([1, 2, 3, 4])
    const asked = 'fix the login bug ' + 'x'.repeat(400)
    const p = speechPrompt(s, '1 prompt', { prompt: asked, answer: 'Fixed the null check in auth.ts.' })
    expect(p.prompt).toContain('fix the login bug')
    expect(p.prompt).toContain('Fixed the null check in auth.ts.')
    expect(p.prompt).toContain(asked.slice(0, 300))
    expect(p.prompt).not.toContain(asked.slice(0, 301))
    expect(p.prompt).toContain('1 prompt')
    expect(p.system).toMatch(/never quote secrets or code/i)
  })
  test('facts: no conversation in the prompt, the system prompt as before', () => {
    const s = freshSave([1, 2, 3, 4])
    const facts = speechPrompt(s, '1 prompt')
    expect(facts).toEqual(speechPrompt(s, '1 prompt', null))
    expect(facts.prompt).not.toMatch(/asked|answered/i)
    expect(facts.system).not.toMatch(/asked/i)
  })
  test('conversation: an empty prompt or answer is left out', () => {
    const p = speechPrompt(freshSave([1, 2, 3, 4]), 'a quiet turn', { prompt: null, answer: '' })
    expect(p.prompt).not.toMatch(/asked|answered/i)
  })
  test('system prompt has no em dash', () => {
    expect(speechPrompt(freshSave([1, 2, 3, 4]), 'x').system.includes('—')).toBe(false)
  })
  test('cleanReply strips quotes, trims and rejects junk', () => {
    expect(cleanReply('  "Char! Nice fix."  ', 80)).toBe('Char! Nice fix.')
    expect(cleanReply('', 80)).toBe(null)
    expect(cleanReply('   ', 80)).toBe(null)
    expect(cleanReply('""', 80)).toBe(null)
    expect(cleanReply('x'.repeat(200), 80)!.length).toBe(80)
    expect(cleanReply('line one\nline two', 80)).toBe('line one')
  })
  test('cleanReply rejects refusals and lead-ins', () => {
    expect(cleanReply("I can't roleplay that.", 80)).toBe(null)
    expect(cleanReply('I can’t do that', 80)).toBe(null)
    expect(cleanReply('I cannot help', 80)).toBe(null)
    expect(cleanReply('Sorry, no.', 80)).toBe(null)
    expect(cleanReply('As an AI, I lack feelings', 80)).toBe(null)
    expect(cleanReply('Here is my reaction:', 80)).toBe(null)
    expect(cleanReply('"Sorry about that test!"', 80)).toBe(null)
    expect(cleanReply('Squirtle! Nice push.', 80)).toBe('Squirtle! Nice push.')
  })
  test('speak returns the cleaned model reply', async () => {
    const $ = client(() => ({ isAnswered: true, text: '"Pika pi!"\nextra', usage }))
    const s = { ...freshSave([1, 2, 3, 4]), species: 25 }
    expect(await speak($, 'haiku', s, 'a quiet turn')).toBe('Pika pi!')
  })
  test('speak falls back to a cry when the model fails', async () => {
    const $ = client(() => ({ isAnswered: false, reason: 'api-error', status: 500, error: 'server_error', usage }))
    const s = { ...freshSave([1, 2, 3, 4]), species: 25 }
    expect(await speak($, 'haiku', s, 'a quiet turn')).toMatch(/Pika/)
  })
  test('speak falls back to a cry when the hook throws', async () => {
    const $ = client(() => { throw new Error('boom') })
    const s = { ...freshSave([1, 2, 3, 4]), species: 25 }
    expect(await speak($, 'haiku', s, 'a quiet turn')).toMatch(/Pika/)
  })
})
