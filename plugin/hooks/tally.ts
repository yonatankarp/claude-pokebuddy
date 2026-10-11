import { CHECKS_MAX } from './config'
import type { Signal } from './signals'

/** Where EXP comes from. types/index.d.ts spells the same list for Save (tests/types.test.ts keeps them equal). */
export const SOURCES = ['prompt', 'tool', 'active', 'config', 'commit', 'push', 'green', 'judge', 'feed'] as const
export type Source = (typeof SOURCES)[number]
export const EXP = { prompt: 10, tool: 2, active: 5, config: 25, commit: 30, push: 50, green: 40 } as const
export const TOOL_CAP = 40
/** The most of each that one turn counts, for EXP and for the stone counters alike. */
export const TURN_CAP = { config: 3, commit: 3, push: 2, green: 3 } as const

export type Tally = { prompts: number; signals: Signal[]; activeWindows: number }
export const emptyTally = (): Tally => ({ prompts: 0, signals: [], activeWindows: 0 })
export type Checks = Readonly<Record<string, boolean>>

/** The tally of an interrupted turn: a check cut short is not a failure. */
export const withoutReds = (t: Tally): Tally => ({ ...t, signals: t.signals.filter(s => s.kind !== 'check' || s.ok) })

export function scoreTally(t: Tally, checks: Checks) {
  const by: Partial<Record<Source, number>> = {}
  const add = (s: Source, n: number) => { if (n > 0) by[s] = (by[s] ?? 0) + n }
  const nextChecks: Record<string, boolean> = { ...checks }
  const configFiles = new Set<string>()
  let tools = 0, greens = 0, commits = 0, pushes = 0
  for (const s of t.signals) {
    if (s.kind === 'tool') tools++
    else if (s.kind === 'config') configFiles.add(s.file)
    else if (s.kind === 'commit') commits++
    else if (s.kind === 'push' || s.kind === 'pr') pushes++
    else if (s.kind === 'check') {
      if (!s.ok) {
        // Re-inserted so key order stays oldest failure first, for the cap below.
        delete nextChecks[s.key]
        nextChecks[s.key] = true
      }
      else if (nextChecks[s.key]) { greens++; delete nextChecks[s.key] }
    }
  }
  greens = Math.min(TURN_CAP.green, greens)
  commits = Math.min(TURN_CAP.commit, commits)
  pushes = Math.min(TURN_CAP.push, pushes)
  const configEdits = Math.min(TURN_CAP.config, configFiles.size)
  const keys = Object.keys(nextChecks)
  for (const k of keys.slice(0, Math.max(0, keys.length - CHECKS_MAX))) delete nextChecks[k]
  add('prompt', t.prompts * EXP.prompt)
  add('tool', Math.min(TOOL_CAP, tools * EXP.tool))
  add('active', t.activeWindows * EXP.active)
  add('config', configEdits * EXP.config)
  add('commit', commits * EXP.commit)
  add('push', pushes * EXP.push)
  add('green', greens * EXP.green)
  const total = Object.values(by).reduce((a, n) => a + (n ?? 0), 0)
  return { bySource: by, total, checks: nextChecks as Checks, greens, commits, pushes, configEdits }
}
