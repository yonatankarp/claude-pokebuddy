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
  const configs = [...new Set(signals.flatMap(s => (s.kind === 'config' ? [s.path.split('/').pop()!] : [])))]
  if (configs.length) parts.push('edited config: ' + configs.join(', '))
  return parts.length ? parts.join('; ') : 'a quiet turn'
}

export function cry(name: string, rand: () => number): string {
  const base = name.charAt(0) + name.slice(1, 4).toLowerCase()
  const shapes = [`${base}!`, `${base} ${base.toLowerCase()}!`, `${base}...?`, `${base}~`]
  return shapes[Math.floor(rand() * shapes.length)]!
}

export function speechPrompt(save: Save, facts: string): { system: string; prompt: string } {
  const sp = species(save.species)
  return {
    system: 'You are a Pokémon companion living in a developer\'s terminal. Reply with one short line (max 12 words) in character, reacting to what just happened. Use your cry sometimes. No quotes, no emoji, no markdown, no em dashes.',
    prompt: `You are ${save.nickname ?? sp.name}, a ${save.isShiny ? 'shiny ' : ''}${sp.name} at level ${save.level}, ${save.personality} by nature. This turn: ${facts}.`,
  }
}

export function cleanReply(text: string, max: number): string | null {
  const first = text.split('\n').map(l => l.trim()).find(l => l.length > 0)
  if (!first) return null
  const unquoted = first.replace(/^["'“”]+|["'“”]+$/g, '').trim()
  return unquoted ? unquoted.slice(0, max) : null
}

export async function speak($: { model: Pick<EngineInterface['model'], 'complete'> }, model: string, save: Save, facts: string): Promise<string> {
  let fallback = 'Pika!'
  try {
    fallback = cry(species(save.species).name, Math.random)
    const { system, prompt } = speechPrompt(save, facts)
    const r = await $.model.complete({ model, system, prompt, maxTokens: 60, timeoutMs: SPEECH_TIMEOUT_MS })
    return (r.isAnswered && cleanReply(r.text, 80)) || fallback
  } catch {
    return fallback
  }
}
