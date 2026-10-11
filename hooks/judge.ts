import type { EngineInterface } from 'claude-code'
import { JUDGE_TIMEOUT_MS } from './config'

export function judgePrompt(log: readonly string[]): string {
  return [
    'Score this coding session from 0 to 100 for useful progress.',
    'High: shipped work (commits, pushes, PRs), fixed failures (a check failed then passed), improved setup (config edits).',
    'Low: many tool calls with no outcome, repeated failures, nothing finished.',
    'Reply with the number only.',
    '',
    'Turns:',
    ...log.map(l => `- ${l}`),
  ].join('\n')
}

export function parseScore(text: string): number | null {
  const m = text.match(/-?\d+/)
  if (!m) return null
  return Math.max(0, Math.min(100, Number(m[0])))
}

export async function judge($: { model: Pick<EngineInterface['model'], 'complete'> }, model: string, log: readonly string[]): Promise<number | null> {
  if (log.length === 0) return null
  try {
    const r = await $.model.complete({ model, prompt: judgePrompt(log), maxTokens: 10, timeoutMs: JUDGE_TIMEOUT_MS })
    return r.isAnswered ? parseScore(r.text) : null
  } catch {
    return null
  }
}
