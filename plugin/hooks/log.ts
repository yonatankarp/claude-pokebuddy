import { LOG_LINE_MAX } from './config'
import { fileName, rekeyCheck } from './signals'

const oneLine = (text: string) => text.replace(/[\t\r\n]+/g, ' ')

/**
 * A pendingLog line is `<session id>\t<ms>\t<facts>`: the session it came from and when, so a session
 * judges only sessions that have ended. Older builds wrote `<session id>\t<facts>`, and the first ones
 * no tag at all (session ''). At most LOG_LINE_MAX long.
 */
export const tagLine = (sid: string, nowMs: number, facts: string) =>
  `${oneLine(sid)}\t${Math.max(0, Math.floor(nowMs))}\t${oneLine(facts)}`.slice(0, LOG_LINE_MAX)

type LogLine = { sid: string; ms: number | null; facts: string }

export function parseLine(line: string): LogLine {
  const parts = line.split('\t')
  if (parts.length >= 3 && /^\d+$/.test(parts[1]!)) return { sid: parts[0]!, ms: Number(parts[1]), facts: parts.slice(2).join('\t') }
  if (parts.length >= 2) return { sid: parts[0]!, ms: null, facts: parts.slice(1).join('\t') }
  return { sid: '', ms: null, facts: line }
}
export const lineSession = (line: string) => parseLine(line).sid

/** How long a session that never said it ended (a crash, a kill) waits after its last turn to be judged. */
export const STALE_MS = 24 * 60 * 60 * 1000
/** The most session ids the save keeps as ended but not yet judged. */
export const FINISHED_MAX = 50

/**
 * At a session start: the facts of every session that has ended, to judge, and the log without them.
 * A session has ended when its id is in `finished` (its session.end said so), when its lines carry no
 * time (an older build wrote them) or when its newest line is older than STALE_MS. The starting session
 * `sid` never has: a reload or a resume goes on under the same id.
 */
export function takeEnded(log: readonly string[], finished: readonly string[], sid: string, nowMs: number): { taken: string[]; log: string[] } {
  const lines = log.map(l => ({ raw: l, ...parseLine(l) }))
  const newest = new Map<string, number>()
  for (const l of lines) if (l.ms !== null) newest.set(l.sid, Math.max(l.ms, newest.get(l.sid) ?? 0))
  const done = new Set(finished)
  const hasEnded = (id: string) => {
    if (id === sid) return false
    const last = newest.get(id)
    return done.has(id) || last === undefined || nowMs - last > STALE_MS
  }
  return {
    taken: lines.filter(l => hasEnded(l.sid)).map(l => l.facts),
    log: lines.filter(l => !hasEnded(l.sid)).map(l => l.raw),
  }
}

const COUNT = /^\d+ (prompts?|tool calls?|commits?|push(e?s)?|PRs? opened)$/

/**
 * An older build's facts with only the parts this build writes: counts, `checks:` cut down to check keys,
 * `edited config:` file names and `a quiet turn`. Anything else (a quoted `; ` in a command split it) goes.
 */
function rekeyFacts(facts: string): string {
  const kept = facts.split('; ').flatMap(part => {
    if (part === 'a quiet turn' || COUNT.test(part)) return [part]
    if (part.startsWith('checks: ')) {
      const found = [...part.slice('checks: '.length).matchAll(/(?:^|, )(.+?) (passed|failed)(?=, |$)/g)]
      return found.length ? ['checks: ' + found.map(m => `${rekeyCheck(m[1]!)} ${m[2]}`).join(', ')] : []
    }
    if (part.startsWith('edited config: ')) {
      const names = part.slice('edited config: '.length).split(', ').map(fileName).filter(Boolean)
      return names.length ? ['edited config: ' + names.join(', ')] : []
    }
    return []
  })
  return kept.length ? kept.join('; ') : 'a quiet turn'
}

/** A line as this build reads it: an older build's check commands cut down to keys, and at most LOG_LINE_MAX. */
export function normaliseLine(line: string): string {
  if (parseLine(line).ms !== null) return line.slice(0, LOG_LINE_MAX)
  const tab = line.indexOf('\t')
  return (line.slice(0, tab + 1) + rekeyFacts(line.slice(tab + 1))).slice(0, LOG_LINE_MAX)
}
