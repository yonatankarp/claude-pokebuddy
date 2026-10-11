import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'
import { countsAsPrompt, isPaneShown, shouldHandleTurn } from '../hooks/register'
import { COMMAND, EVOLVE_MS, PANE_CHECK_MS, TICK_MS } from '../hooks/config'
import { species } from '../hooks/data/dex'
import { expForLevel } from '../hooks/exp'
import { exportBlob, freshSave } from '../hooks/state'
import { artSize } from '../hooks/render/sprite'
import { PANE_TEXT_ROWS } from '../hooks/render/pane'

const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
let toasts: string[] = []
let modelCalls: string[] = []
let modelReply = '42'
let redraws = 0

const copy = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

/**
 * What lies beneath the mod in a session, answered in memory: `$.store` (the kit's `$` has no
 * `store` noun, so the test keeps the map to read what the mod wrote), the session's start,
 * command registration and toasts.
 */
function world(on: On, entries: Record<string, unknown> = {}, sid: string | null = 'S1') {
  const store = new Map<string, unknown>(Object.entries(entries).map(([k, v]) => [k, copy(v)]))
  toasts = []
  redraws = 0
  modelCalls = []
  on('store.get', async (_$, e) => ({ value: copy(store.get(e.key)) }))
  on('store.set', async (_$, e) => { store.set(e.key, copy(e.value)); return { value: undefined } })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.id', async () => {
    if (sid === null) throw new Error('no session id')
    return { value: sid }
  })
  on('model.complete', async (_$, e) => {
    modelCalls.push(e.prompt)
    return { value: { isAnswered: true as const, text: modelReply, usage } }
  })
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.invalidate', async () => { redraws++; return { value: undefined } })
  return store
}

/** The model loop beneath the mod: prompts and turns answer as given; Bash fails when the command says so. */
function loop(on: On) {
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  on('tool.call', async (_$, e) => {
    const isError = e.tool === 'Bash' && String((e as { command?: unknown }).command).includes('fail')
    return isError ? { result: 'Error: Exit code 1', text: 'Exit code 1', isError: true as const } : { result: 'ok', text: 'ok' }
  })
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
}

const NOON = Date.UTC(2026, 9, 11, 12)
const prompt = ($: Engine, text = 'fix it') => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
const bash = ($: Engine, command: string) => $.tool.call({ tool: 'Bash', command })
const endTurn = ($: Engine, agentId?: string) =>
  $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', ...(agentId ? { agentId } : {}) })

type Stored = { expBySource: Record<string, number>; pendingLog: string[]; counters: Record<string, number>; species: number; evolution: unknown; level: number }

const run = (args: string) => ({
  command: 'buddy', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 },
})

/** The kit does not start a session on its own: raise `session.start` as a session opening does. */
const start = ($: Engine, isInteractive = true) => $.session.start({ cwd: '/', surface: isInteractive ? 'terminal' : null, isInteractive })

describe('register', () => {
  test('first session rolls and stores a save', async ($, on) => {
    const store = world(on)
    mock.clock(on, { now: Date.UTC(2026, 9, 11, 12) })
    await start($)
    await $.command.run(run('stats'))
    const save = store.get('save') as { level: number } | undefined
    expect(save?.level).toBe(5)
  })

  test('a future-version save is left untouched and commands say read-only', async ($, on) => {
    const store = world(on, { save: { version: 99, anything: true } })
    mock.clock(on)
    await start($)
    const r = await $.command.run(run('feed'))
    expect(r.text).toMatch(/newer version/)
    expect(store.get('save')).toEqual({ version: 99, anything: true })
  })

  test('a future-version save toasts once per session', async ($, on) => {
    world(on, { save: { version: 99, anything: true } })
    mock.clock(on)
    await start($)
    await $.command.run(run('feed'))
    await $.command.run(run('stats'))
    expect(toasts.filter(t => /newer version/.test(t))).toHaveLength(1)
  })

  test('a corrupt save is kept, backed up and the mod goes read-only', async ($, on) => {
    const store = world(on, { save: 'garbage' })
    mock.clock(on)
    await start($)
    const r = await $.command.run(run('stats'))
    await $.command.run(run('feed'))
    expect(store.get('save')).toBe('garbage')
    expect(store.get('save.bak')).toBe('garbage')
    expect(r.text).toMatch(/could not be read/)
    expect(toasts.filter(t => /could not be read.*save\.bak.*\/buddy restore.*\/buddy reset/.test(t))).toHaveLength(1)
  })

  test('a corrupt save never overwrites a valid backup', async ($, on) => {
    const good = freshSave([9, 9, 9, 9])
    const store = world(on, { save: 'garbage', 'save.bak': good })
    mock.clock(on)
    await start($)
    await $.command.run(run('stats'))
    expect(store.get('save.bak')).toEqual(good)
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatch(/previous backup in save\.bak was kept; the damaged save was left in place/)
    expect(toasts[0]).not.toMatch(/It was kept in save\.bak/)
    expect(toasts[0]).toMatch(/\/buddy restore or \/buddy reset/)
  })

  test('restore swaps a valid backup in and keeps the current raw as save.bak', async ($, on) => {
    const good = freshSave([9, 9, 9, 9])
    const store = world(on, { save: 'garbage', 'save.bak': good })
    mock.clock(on)
    await start($)
    const r = await $.command.run(run('restore'))
    expect(r.text).toMatch(/Restored/)
    expect(store.get('save')).toEqual(good)
    expect(store.get('save.bak')).toBe('garbage')
    const after = await $.command.run(run('toggle'))
    expect(after.text).toMatch(/view/)
  })

  test('restore refuses a backup that is not a valid save', async ($, on) => {
    const store = world(on, { save: 'garbage', 'save.bak': 'also garbage' })
    mock.clock(on)
    await start($)
    const r = await $.command.run(run('restore'))
    expect(r.text).toMatch(/save\.bak/)
    expect(store.get('save')).toBe('garbage')
  })

  test('reset over a corrupt save keeps a readable backup', async ($, on) => {
    const good = freshSave([9, 9, 9, 9])
    const store = world(on, { save: 'garbage', 'save.bak': good })
    mock.clock(on)
    await start($)
    const r = await $.command.run(run('reset confirm'))
    expect(store.get('save.bak')).toEqual(good)
    expect((store.get('save') as { version: number }).version).toBe(1)
    expect(r.text).toMatch(/save\.bak keeps the backup/)
  })

  test('reset rolls a fresh save and backs up the current one', async ($, on) => {
    const s = freshSave([1, 2, 3, 4])
    const store = world(on, { save: s })
    mock.clock(on)
    await start($)
    const r = await $.command.run(run('reset confirm'))
    expect(r.text).toMatch(/save\.bak/)
    expect(store.get('save.bak')).toEqual(s)
    const fresh = store.get('save') as { version: number; seed: number[] }
    expect(fresh.version).toBe(1)
    expect(fresh.seed).not.toEqual(s.seed)
  })

  test('reset without confirm says what would happen and changes nothing', async ($, on) => {
    const s = freshSave([1, 2, 3, 4])
    const store = world(on, { save: s })
    mock.clock(on, { now: NOON })
    await start($)
    const r = await $.command.run(run('reset'))
    expect(r.text).toMatch(/\/buddy reset confirm/)
    expect(r.text).toContain(species(s.species).name)
    expect(store.get('save')).toEqual(s)
    expect(store.has('save.bak')).toBe(false)
  })

  test('reset confirm works once per local day', async ($, on) => {
    const store = world(on, { save: freshSave([1, 2, 3, 4]) })
    const clock = mock.clock(on, { now: NOON })
    await start($)
    const first = await $.command.run(run('reset confirm'))
    expect(first.text).toMatch(/appeared/)
    const rolled = store.get('save') as { seed: number[]; lastResetDate: string | null }
    expect(rolled.lastResetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const second = await $.command.run(run('reset confirm'))
    expect(second.text).toMatch(/once a day/)
    expect((store.get('save') as { seed: number[] }).seed).toEqual(rolled.seed)
    await clock.advance(24 * 60 * 60 * 1000)
    const tomorrow = await $.command.run(run('reset confirm'))
    expect(tomorrow.text).toMatch(/appeared/)
  })

  test('reset confirm is always allowed over a corrupt save', async ($, on) => {
    const store = world(on, { save: { ...freshSave([1, 2, 3, 4]), lastResetDate: 'not a date' } })
    mock.clock(on, { now: NOON })
    await start($)
    const r = await $.command.run(run('reset confirm'))
    expect(r.text).toMatch(/appeared/)
    expect((store.get('save') as { version: number }).version).toBe(1)
  })

  test('a save from before lastResetDate loads and can reset', async ($, on) => {
    const { lastResetDate: _, ...old } = freshSave([1, 2, 3, 4])
    const store = world(on, { save: old })
    mock.clock(on, { now: NOON })
    await start($)
    const stats = await $.command.run(run('stats'))
    expect(stats.text).not.toMatch(/could not be read/)
    const r = await $.command.run(run('reset confirm'))
    expect(r.text).toMatch(/appeared/)
    expect(store.get('save.bak')).toEqual({ ...old, lastResetDate: null })
  })

  test('feed once a day through the command', async ($, on) => {
    const store = world(on, { save: freshSave([1, 2, 3, 4]) })
    mock.clock(on, { now: Date.UTC(2026, 9, 11, 12) })
    await start($)
    const first = await $.command.run(run('feed'))
    expect(first.text).toMatch(/Rare Candy/)
    const second = await $.command.run(run('feed'))
    expect(second.text).toMatch(/already/)
  })

  test('export then import restores the same save', async ($, on) => {
    const s = freshSave([7, 7, 7, 7])
    const store = world(on, { save: s })
    mock.clock(on)
    await start($)
    const r = await $.command.run(run(`import ${exportBlob(s)}`))
    expect(r.text).toMatch(/Restored/)
    expect(store.get('save')).toEqual(s)
  })

  test('a change another session wrote to the store survives this session\'s next command', async ($, on) => {
    const s = freshSave([1, 2, 3, 4])
    const store = world(on, { save: s })
    mock.clock(on, { now: Date.UTC(2026, 9, 11, 12) })
    await start($)
    await $.command.run(run('stats'))
    store.set('save', { ...s, nickname: 'Other', lifetimeExp: 999 })
    await $.command.run(run('toggle'))
    const after = store.get('save') as { nickname: string; lifetimeExp: number; view: string }
    expect(after.nickname).toBe('Other')
    expect(after.lifetimeExp).toBe(999)
    expect(after.view).toBe('compact')
  })

  test('a save stuck mid-evolution is finished on load', async ($, on) => {
    const store = world(on, { save: { ...freshSave([1, 2, 3, 4]), species: 4, level: 16, exp: expForLevel(species(4).growth, 16), evolution: { to: 5 } } })
    mock.clock(on)
    await start($)
    await $.command.run(run('stats'))
    const after = store.get('save') as { species: number; evolution: unknown }
    expect(after.species).toBe(5)
    expect(after.evolution).toBe(null)
  })

  test('a turn scores its prompt and tool call and logs its facts', async ($, on) => {
    const store = world(on, { save: freshSave([1, 2, 3, 4]) })
    loop(on)
    mock.clock(on, { now: NOON })
    await start($)
    await prompt($)
    await bash($, 'ls')
    await endTurn($)
    const after = store.get('save') as Stored
    expect(after.expBySource.prompt).toBe(10)
    expect(after.expBySource.tool).toBe(2)
    expect(after.pendingLog).toHaveLength(1)
    await prompt($)
    await bash($, 'ls')
    await endTurn($, 'a1')
    expect(store.get('save')).toEqual(after)
  })

  test('a commit in a turn earns commit EXP and counts toward the Fire Stone', async ($, on) => {
    const store = world(on, { save: freshSave([1, 2, 3, 4]) })
    loop(on)
    mock.clock(on, { now: NOON })
    await start($)
    await prompt($)
    await bash($, 'git commit -m x')
    await endTurn($)
    const after = store.get('save') as Stored
    expect(after.expBySource.commit).toBe(30)
    expect(after.counters.commits).toBe(1)
  })

  test('a Bash commit that fails (isError) earns no commit EXP', async ($, on) => {
    const store = world(on, { save: freshSave([1, 2, 3, 4]) })
    loop(on)
    mock.clock(on, { now: NOON })
    await start($)
    await bash($, 'git commit -m fail')
    await endTurn($)
    const after = store.get('save') as Stored
    expect(after.expBySource.commit).toBeUndefined()
    expect(after.counters.commits).toBe(0)
  })

  test('a level-up into an evolution finishes after the evolution window', async ($, on) => {
    const growth = species(4).growth
    const store = world(on, { save: { ...freshSave([1, 2, 3, 4]), species: 4, level: 15, exp: expForLevel(growth, 16) - 1 } })
    loop(on)
    const clock = mock.clock(on, { now: NOON })
    await start($)
    await prompt($)
    await endTurn($)
    const evolving = store.get('save') as Stored
    expect(evolving.level).toBe(16)
    expect(evolving.evolution).toEqual({ to: 5 })
    await clock.advance(EVOLVE_MS)
    const after = store.get('save') as Stored
    expect(after.species).toBe(5)
    expect(after.evolution).toBe(null)
  })

  /** A loop where the calls named in `failing` fail, and the permission check denies those in `denied`. */
  function checks(on: On, failing: string[], denied: string[] = []) {
    on('prompt.submit', async (_$, e) => ({ text: e.text }))
    on('tool.check', async (_$, e) => ({ decision: denied.includes(String(e.tool_use_id)) ? 'deny' as const : 'allow' as const }))
    on('tool.call', async (_$, e) => failing.includes(e.tool_use_id)
      ? { result: 'Error: Exit code 1', text: 'Exit code 1', isError: true as const }
      : { result: 'ok', text: 'ok' })
    on('turn.complete', async (_$, e) => ({ text: e.answer }))
  }
  const npmTest = async ($: Engine, id: string) => {
    await $.tool.check({ tool: 'Bash', input: { command: 'npm test' }, tool_use_id: id })
    await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: id })
  }

  test('a failing check then a passing one earns green EXP', async ($, on) => {
    const store = world(on, { save: freshSave([1, 2, 3, 4]) })
    checks(on, ['red'])
    mock.clock(on, { now: NOON })
    await start($)
    await npmTest($, 'red')
    await endTurn($)
    await npmTest($, 'green')
    await endTurn($)
    expect((store.get('save') as Stored).expBySource.green).toBe(40)
  })

  test('a check the permission check denied is no red', async ($, on) => {
    const store = world(on, { save: freshSave([1, 2, 3, 4]) })
    checks(on, ['red'], ['red'])
    mock.clock(on, { now: NOON })
    await start($)
    await npmTest($, 'red')
    await endTurn($)
    await npmTest($, 'green')
    await endTurn($)
    expect((store.get('save') as Stored).expBySource.green).toBeUndefined()
  })

  test('an interrupted turn drops its red checks and keeps the rest', async ($, on) => {
    const store = world(on, { save: freshSave([1, 2, 3, 4]) })
    checks(on, ['red'])
    mock.clock(on, { now: NOON })
    await start($)
    await npmTest($, 'red')
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'answer' })
    expect((store.get('save') as Stored).expBySource.tool).toBe(2)
    await npmTest($, 'green')
    await endTurn($)
    expect((store.get('save') as Stored).expBySource.green).toBeUndefined()
  })

  test('a session start that throws still lets the session start', async ($, on) => {
    world(on, { save: freshSave([1, 2, 3, 4]) }, null)
    mock.clock(on, { now: NOON })
    expect(await start($)).toEqual({ cwd: '/' })
  })

  test('a v1 save with more than 100 failing checks loads, keeping the newest 100', async ($, on) => {
    const checks = Object.fromEntries(Array.from({ length: 130 }, (_, i) => [`check ${i}`, true]))
    const store = world(on, { save: { ...freshSave([1, 2, 3, 4]), checks } })
    mock.clock(on, { now: NOON })
    await start($)
    const r = await $.command.run(run('stats'))
    expect(r.text).not.toMatch(/could not be read/)
    const kept = Object.keys((store.get('save') as { checks: Record<string, boolean> }).checks)
    expect(kept).toHaveLength(100)
    expect(kept[0]).toBe('check 30')
    expect(kept[99]).toBe('check 129')
  })

  test('the command name the hooks spell literally is COMMAND', () => {
    expect(COMMAND).toBe('buddy')
  })

  test('only the person\'s own prompts earn prompt EXP', () => {
    expect(countsAsPrompt({ text: '/buddy feed', origin: { kind: 'composer' } })).toBe(false)
    expect(countsAsPrompt({ text: 'fix it', origin: { kind: 'plugin', name: 'x' } })).toBe(false)
    expect(countsAsPrompt({ text: 'fix it', origin: { kind: 'task-notification' } })).toBe(false)
    expect(countsAsPrompt({ text: 'fix it', origin: { kind: 'scheduled-trigger' } })).toBe(false)
    expect(countsAsPrompt({ text: 'fix it', origin: { kind: 'sdk' } })).toBe(false)
    expect(countsAsPrompt({ text: 'fix it', origin: { kind: 'composer' } })).toBe(true)
    expect(countsAsPrompt({ text: 'fix it', origin: { kind: 'bridge' } })).toBe(true)
  })

  test('a turn tags its log line with the session id', async ($, on) => {
    const store = world(on, { save: freshSave([1, 2, 3, 4]) })
    loop(on)
    mock.clock(on, { now: NOON })
    await start($)
    await prompt($)
    await endTurn($)
    expect((store.get('save') as Stored).pendingLog).toEqual(['S1\t1 prompt'])
  })

  test('session start judges other sessions\' lines once and keeps its own', async ($, on) => {
    const s = { ...freshSave([1, 2, 3, 4]), pendingLog: ['OLD\t1 commit', 'plain line', 'S1\t1 prompt'] }
    const store = world(on, { save: s })
    const clock = mock.clock(on, { now: NOON })
    await start($)
    await clock.advance(1)
    const after = store.get('save') as Stored
    expect(after.pendingLog).toEqual(['S1\t1 prompt'])
    expect(after.expBySource.judge).toBe(42)
    expect(modelCalls).toHaveLength(1)
    expect(modelCalls[0]).toContain('- 1 commit')
    expect(modelCalls[0]).toContain('- plain line')
    expect(modelCalls[0]).not.toContain('1 prompt')
    await start($)
    await clock.advance(1)
    expect(modelCalls).toHaveLength(1)
    expect((store.get('save') as Stored).expBySource.judge).toBe(42)
  })

  test('a reload of the same session judges nothing', async ($, on) => {
    const s = { ...freshSave([1, 2, 3, 4]), pendingLog: ['S1\t1 prompt'] }
    const store = world(on, { save: s })
    const clock = mock.clock(on, { now: NOON })
    await start($)
    await clock.advance(1)
    expect(modelCalls).toHaveLength(0)
    expect((store.get('save') as Stored).pendingLog).toEqual(['S1\t1 prompt'])
  })

  test('quiet makes no model calls: no judge, no speech, finished logs dropped', async ($, on) => {
    const s = { ...freshSave([1, 2, 3, 4]), speechOn: false, pendingLog: ['OLD\t1 commit'] }
    const store = world(on, { save: s })
    loop(on)
    const clock = mock.clock(on, { now: NOON })
    await start($)
    await prompt($)
    await endTurn($)
    await clock.advance(1)
    expect(modelCalls).toHaveLength(0)
    expect((store.get('save') as Stored).pendingLog).toEqual(['S1\t1 prompt'])
  })

  test('a headless run earns nothing, speaks not and leaves the log alone', async ($, on) => {
    const s = { ...freshSave([1, 2, 3, 4]), pendingLog: ['OLD\t1 commit'] }
    const store = world(on, { save: s })
    loop(on)
    const clock = mock.clock(on, { now: NOON })
    await start($, false)
    await prompt($)
    await bash($, 'git commit -m x')
    await endTurn($)
    await clock.advance(1)
    expect(modelCalls).toHaveLength(0)
    expect(store.get('save')).toEqual(s)
  })

  test('only main-loop turns are handled', () => {
    expect(shouldHandleTurn({ isAborted: false })).toBe(true)
    expect(shouldHandleTurn({ agentId: 'a1', isAborted: false })).toBe(false)
  })

  const band = ($: Engine, maxRows = 60) => $.ui.mount({
    plugin: 'pokebuddy', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns: 195, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
    viewport: { columns: 200, rows: 60 },
  })
  const pika = (view: 'full' | 'compact' = 'full') => ({ ...freshSave([1, 2, 3, 4]), species: 25, exp: expForLevel(species(25).growth, 5), view })

  for (const [name, view, maxRows, animates] of [
    ['the band draws the animated sprite', 'full', 60, true],
    ['the band falls back to the still icon', 'full', artSize(species(25), 'icon').rows + 1, false],
    ['the band is compact', 'compact', 60, false],
  ] as const) {
    test(`redraws ${animates ? 'run' : 'stop'} while ${name}`, async ($, on) => {
      world(on, { save: pika(view) })
      const clock = mock.clock(on, { now: NOON })
      await start($)
      await $.command.run(run('stats'))
      const ui = await band($, maxRows)
      const before = redraws
      await clock.advance(TICK_MS * 2 * 3 + 1)
      if (animates) expect(redraws - before >= 3).toBe(true)
      else expect(redraws - before).toBe(0)
      await ui.unmount()
    })
  }

  /**
   * `mock.clock` whose `clock.every` answers are counted: one per period the mod's timer asks for.
   * A second `clock.every` hook is refused, so the count wraps the kit's own.
   */
  function countingClock(on: On, now: number) {
    const timer = { count: 0 }
    const counting = ((name: string, ...rest: unknown[]) => {
      if (name === 'clock.every') {
        const answer = rest.pop() as (...a: unknown[]) => unknown
        rest.push((...a: unknown[]) => { timer.count++; return answer(...a) })
      }
      return (on as (...a: unknown[]) => unknown)(name, ...rest)
    }) as On
    return { clock: mock.clock(counting, { now }), timer }
  }

  test('the compact view runs no timer at all', async ($, on) => {
    world(on, { save: pika('compact') })
    const { clock, timer } = countingClock(on, NOON)
    await start($)
    await $.command.run(run('stats'))
    const ui = await band($)
    await clock.advance(1000)
    expect(timer.count).toBe(0)
    expect(redraws).toBe(0)
    await ui.unmount()
  })

  test('the timer starts when the band draws the sprite and stops when it falls back', async ($, on) => {
    world(on, { save: pika() })
    const { clock, timer } = countingClock(on, NOON)
    await start($)
    await $.command.run(run('stats'))
    expect(timer.count).toBe(0)
    const big = await band($)
    await clock.advance(TICK_MS * 2 * 3 + 1)
    expect(timer.count >= 3).toBe(true)
    await big.unmount()
    const small = await band($, artSize(species(25), 'icon').rows + 1)
    await clock.advance(1)
    const after = { periods: timer.count, redraws }
    await clock.advance(1000)
    expect(timer.count).toBe(after.periods)
    expect(redraws).toBe(after.redraws)
    await small.unmount()
  })

  test('a headless session runs no timer', async ($, on) => {
    world(on, { save: pika() })
    const { clock, timer } = countingClock(on, NOON)
    await start($, false)
    await $.command.run(run('stats'))
    const ui = await band($)
    await clock.advance(1000)
    expect(timer.count).toBe(0)
    await ui.unmount()
  })

  const shownPane = (isShown: boolean) => ({ id: 'pokebuddy', title: 'PIKACHU', isShown, isFocused: false, isPlaced: true })
  test('isPaneShown wants the pokebuddy pane listed and shown', () => {
    expect(isPaneShown([])).toBe(false)
    expect(isPaneShown([shownPane(false)])).toBe(false)
    expect(isPaneShown([{ ...shownPane(true), id: 'other' }])).toBe(false)
    expect(isPaneShown([shownPane(true)])).toBe(true)
  })

  for (const [name, listed, keeps] of [
    ['closed without a ui.close', [], false],
    ['behind another tab', [shownPane(false)], false],
    ['shown', [shownPane(true)], true],
  ] as const) {
    test(`the pane recheck ${keeps ? 'keeps' : 'stops'} redraws when the pane is ${name}`, async ($, on) => {
      world(on, { save: pika('compact') })
      on('ui.open', async () => ({ value: { isPlaced: true as const } }))
      on('ui.panes', async () => ({ value: listed }))
      const clock = mock.clock(on, { now: NOON })
      await start($)
      await $.command.run(run('pane'))
      const ui = await $.ui.mount({
        plugin: 'pokebuddy', surface: 'terminal', component: 'Pane', requestId: 'pokebuddy',
        props: { title: 'PIKACHU', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
        viewport: { columns: 200, rows: 50 },
      })
      await clock.advance(PANE_CHECK_MS + TICK_MS * 2 + 1)
      const before = redraws
      await clock.advance(1000)
      if (keeps) expect(redraws - before >= 3).toBe(true)
      else expect(redraws - before).toBe(0)
      await ui.unmount()
    })
  }

  test('a pane too small for the sprite draws the still icon and asks for no redraws', async ($, on) => {
    world(on, { save: pika('compact') })
    on('ui.open', async () => ({ value: { isPlaced: true as const } }))
    const clock = mock.clock(on, { now: NOON })
    await start($)
    await $.command.run(run('pane'))
    const icon = artSize(species(25), 'icon')
    const ui = await $.ui.mount({
      plugin: 'pokebuddy', surface: 'terminal', component: 'Pane', requestId: 'pokebuddy',
      props: { title: 'PIKACHU', isFocused: false, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: icon.rows + PANE_TEXT_ROWS }, view: {} },
      viewport: { columns: 200, rows: 50 },
    })
    expect(await ui.find({ type: 'Text', text: /PIKACHU/ })).toBeDefined()
    const before = redraws
    await clock.advance(TICK_MS * 2 * 3 + 1)
    expect(redraws - before).toBe(0)
    await ui.unmount()
  })

  test('a session start that fires again keeps one redraw timer', async ($, on) => {
    world(on, { save: pika() })
    const clock = mock.clock(on, { now: NOON })
    await start($)
    await start($)
    await $.command.run(run('stats'))
    const ui = await band($)
    const before = redraws
    await clock.advance(TICK_MS * 2 * 4 + 1)
    expect(redraws - before).toBe(4)
    await ui.unmount()
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`/buddy pane opens a pane that draws and animates on ${surface}`, async ($, on) => {
      world(on, { save: { ...pika('compact'), nickname: 'Sparky' } })
      const opened: { id: string; title?: string }[] = []
      on('ui.open', async (_$, e) => { opened.push(e); return { value: { isPlaced: true as const } } })
      const clock = mock.clock(on, { now: NOON })
      await start($)
      const r = await $.command.run(run('pane'))
      expect(opened).toEqual([expect.objectContaining({ id: 'pokebuddy', title: 'Sparky' })])
      expect(r.text).toMatch(/pane/)
      const ui = await $.ui.mount({
        plugin: 'pokebuddy', surface, component: 'Pane', requestId: 'pokebuddy',
        props: { title: 'Sparky', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
        viewport: { columns: 200, rows: 50 },
      })
      expect(await ui.find({ type: 'Text', text: /Sparky/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /▀|▄/ })).toBeDefined()
      const before = redraws
      await clock.advance(TICK_MS * 2 * 3 + 1)
      expect(redraws - before >= 3).toBe(true)
      await ui.unmount()
    })
  }

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`band draws compact on ${surface} and survives maxRows 1 and narrow width`, async ($, on) => {
      const store = world(on, { save: freshSave([1, 2, 3, 4]) })
      mock.clock(on)
      await start($)
      await $.command.run(run('stats'))
      for (const [maxRows, columns] of [[1, 40], [3, 120], [60, 200]] as const) {
        const ui = await $.ui.mount({
          plugin: 'pokebuddy', surface, component: 'AbovePrompt',
          props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns: columns - 5, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
          viewport: { columns, rows: 50 },
        })
        expect(await ui.find({ type: 'Text', text: /Lv5/ })).toBeDefined()
        await ui.unmount()
      }
    })
  }
})
