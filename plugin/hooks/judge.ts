import type { EngineInterface } from 'claude-code'
import { JUDGE_TIMEOUT_MS, LOG_LINE_MAX } from './config'
import { rekeyCheck } from './signals'

const oneLine = (text: string) => text.replace(/[\t\r\n]+/g, ' ')

/**
 * A pendingLog line is `<session id>\t<facts>`, so a session judges only the turns of sessions that
 * have finished. A line without a tab predates the tag and counts as session ''. At most LOG_LINE_MAX long.
 */
export const tagLine = (sid: string, facts: string) => `${oneLine(sid)}\t${oneLine(facts)}`.slice(0, LOG_LINE_MAX)
export const lineSession = (line: string) => (line.includes('\t') ? line.slice(0, line.indexOf('\t')) : '')
export const lineFacts = (line: string) => line.slice(line.indexOf('\t') + 1)

/** The `checks:` part of an older build's facts, its whole commands cut down to check keys. */
export function rekeyFacts(facts: string): string {
  return facts.split('; ').map(part => {
    if (!part.startsWith('checks: ')) return part
    const found = [...part.slice('checks: '.length).matchAll(/(?:^|, )(.+?) (passed|failed)(?=, |$)/g)]
    return found.length ? 'checks: ' + found.map(m => `${rekeyCheck(m[1]!)} ${m[2]}`).join(', ') : 'checks: (dropped)'
  }).join('; ')
}

/** A line an older build wrote, its check commands cut down to keys and the whole cut to LOG_LINE_MAX. */
export function normaliseLine(line: string): string {
  const tab = line.indexOf('\t')
  const head = tab === -1 ? '' : line.slice(0, tab + 1)
  return (head + rekeyFacts(line.slice(tab + 1))).slice(0, LOG_LINE_MAX)
}

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

/** The whole reply as an integer (clamped to 0..100), else the last integer in 0..100 within it. */
export function parseScore(text: string): number | null {
  const whole = text.trim()
  if (/^-?\d+$/.test(whole)) return Math.max(0, Math.min(100, Number(whole)))
  const inRange = (text.match(/\d+/g) ?? []).map(Number).filter(n => n <= 100)
  return inRange.length ? inRange[inRange.length - 1]! : null
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
