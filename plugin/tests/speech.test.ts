import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import { cleanReply, cry, speak, speechPrompt, turnFacts } from '../hooks/speech'
import { configSignal } from '../hooks/signals'
import { freshSave } from '../hooks/state'

const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

// The test engine's `$` has no `model` noun, so the model is a fake client with the same `complete` shape.
const client = (complete: (r: ModelCompleteRequest) => ModelCompleteResult | Promise<ModelCompleteResult>) => ({ model: { complete: async (r: ModelCompleteRequest) => complete(r) } })

describe('speech', () => {
  test('facts summarise without content', () => {
    expect(turnFacts([{ kind: 'tool' }, { kind: 'tool' }, { kind: 'commit' }, { kind: 'check', key: 'npm test', ok: false }, configSignal('/r/CLAUDE.md')], 1))
      .toBe('1 prompt; 2 tool calls; 1 commit; checks: npm test failed; edited config: CLAUDE.md')
  })
  test('a Windows config path reaches the facts as its file name only', () => {
    const facts = turnFacts([configSignal('C:\\Users\\alice\\secretproj\\CLAUDE.md'), configSignal('C:\\Users\\alice\\secretproj\\.claude\\settings.json')], 0)
    expect(facts).toBe('edited config: CLAUDE.md, settings.json')
    expect(facts).not.toMatch(/alice|secretproj/)
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
    expect(cleanReply('x'.repeat(200), 80)).toBe('x'.repeat(79) + '…')
    expect(cleanReply('line one\nline two', 80)).toBe('line one')
  })
  test('a reply too long for the bubble ends on a whole sentence, or else on a whole word and an ellipsis', () => {
    const said = "*rattles bone* Ooh, a mod for Guillotine's characters? Bold. Let's see if you can pull it off."
    expect(cleanReply(said, 80)).toBe("*rattles bone* Ooh, a mod for Guillotine's characters? Bold.")
    expect(cleanReply('Pika! ' + 'a long run of words that never ends a sentence at all '.repeat(3), 80))
      .toBe('Pika! a long run of words that never ends a sentence at all a long run of…')
    // A sentence ending right at the limit is kept whole; a short opening one is not enough on its own.
    expect(cleanReply('Char! ' + 'x'.repeat(73) + '. More', 80)).toBe('Char! ' + 'x'.repeat(73) + '.')
    expect(cleanReply('Hi. ' + 'word '.repeat(30), 80)!.endsWith('word…')).toBe(true)
    for (const reply of [said, 'Pika! ' + 'word '.repeat(40), 'x'.repeat(200)]) expect(cleanReply(reply, 80)!.length).toBeLessThanOrEqual(80)
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
