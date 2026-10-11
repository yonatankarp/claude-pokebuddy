import type { EngineInterface } from 'claude-code'
import { SPEECH_TIMEOUT_MS } from './config'
import { species } from './data/dex'
import type { Signal } from './signals'
import type { Save } from './state'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function turnFacts(signals: readonly Signal[], prompts: number): string {
  const parts: string[] = []
  const count = (k: Signal['kind']) => signals.filter(s => s.kind === k).length
  if (prompts) parts.push(plural(prompts, 'prompt'))
  if (count('tool')) parts.push(plural(count('tool'), 'tool call'))
  if (count('commit')) parts.push(plural(count('commit'), 'commit'))
  if (count('push')) parts.push(plural(count('push'), 'push'))
  if (count('pr')) parts.push(count('pr') === 1 ? '1 PR opened' : `${count('pr')} PRs opened`)
  const checks = signals.filter((s): s is Extract<Signal, { kind: 'check' }> => s.kind === 'check')
  if (checks.length) parts.push('checks: ' + checks.map(c => `${c.key} ${c.ok ? 'passed' : 'failed'}`).join(', '))
  const configs = [...new Set(signals.flatMap(s => (s.kind === 'config' ? [s.name] : [])))]
  if (configs.length) parts.push('edited config: ' + configs.join(', '))
  return parts.length ? parts.join('; ') : 'a quiet turn'
}

/** The first four letters of the name's first word, so `MR. MIME` cries `Mr!`, not `Mr. !`. */
export function cry(name: string, rand: () => number): string {
  const word = (name.split(/\s+/).find(w => /[A-Za-z]/.test(w)) ?? name).replace(/[^A-Za-z]/g, '') || 'Pika'
  const base = word.charAt(0).toUpperCase() + word.slice(1, 4).toLowerCase()
  const shapes = [`${base}!`, `${base} ${base.toLowerCase()}!`, `${base}...?`, `${base}~`]
  return shapes[Math.floor(rand() * shapes.length)]!
}

/** What the person asked this turn and how Claude's answer began; null keeps speech to the facts. */
export type Conversation = { prompt: string | null; answer: string | null }
/** How much of the prompt and of the answer the speech model sees. */
export const EXCERPT_MAX = 300

const FACTS_SYSTEM = 'You are a Pokémon companion living in a developer\'s terminal. Reply with one short line (max 12 words) in character, reacting to what just happened. Use your cry sometimes. No quotes, no emoji, no markdown, no em dashes.'
const CONVERSATION_SYSTEM = 'You are a Pokémon companion living in a developer\'s terminal. Reply with one short line (max 12 words) in character, reacting to what the person asked and what got done. Never quote secrets or code verbatim. Use your cry sometimes. No quotes, no emoji, no markdown, no em dashes.'

const excerpt = (text: string | null) => (text ?? '').trim().slice(0, EXCERPT_MAX)

export function speechPrompt(save: Save, facts: string, talk: Conversation | null = null): { system: string; prompt: string } {
  const sp = species(save.species)
  const who = `You are ${save.nickname ?? sp.name}, a ${save.isShiny ? 'shiny ' : ''}${sp.name} at level ${save.level}, ${save.personality} by nature. This turn: ${facts}.`
  if (!talk) return { system: FACTS_SYSTEM, prompt: who }
  const asked = excerpt(talk.prompt), answered = excerpt(talk.answer)
  return {
    system: CONVERSATION_SYSTEM,
    prompt: [who, ...(asked ? [`The person asked: ${asked}`] : []), ...(answered ? [`Claude answered: ${answered}`] : [])].join('\n'),
  }
}

/** Out-of-character openings: the model refusing or explaining instead of speaking. */
const REFUSAL = /^(i can['’]?t|i cannot|sorry|as an ai)\b/i

export function cleanReply(text: string, max: number): string | null {
  const first = text.split('\n').map(l => l.trim()).find(l => l.length > 0)
  if (!first) return null
  const unquoted = first.replace(/^["'“”]+|["'“”]+$/g, '').trim()
  if (!unquoted || REFUSAL.test(unquoted) || unquoted.endsWith(':')) return null
  return unquoted.slice(0, max)
}

export async function speak($: { model: Pick<EngineInterface['model'], 'complete'> }, model: string, save: Save, facts: string, talk: Conversation | null = null): Promise<string> {
  let fallback = 'Pika!'
  try {
    fallback = cry(species(save.species).name, Math.random)
    const { system, prompt } = speechPrompt(save, facts, talk)
    const r = await $.model.complete({ model, system, prompt, maxTokens: 60, timeoutMs: SPEECH_TIMEOUT_MS })
    return (r.isAnswered && cleanReply(r.text, 80)) || fallback
  } catch {
    return fallback
  }
}
