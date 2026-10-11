import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'
import { countsAsPrompt, shouldHandleTurn } from '../hooks/register'
import { COMMAND, EVOLVE_MS, IDLE_FRAME_MS } from '../hooks/config'
import { species } from '../hooks/data/dex'
import { expForLevel } from '../hooks/exp'
import { exportBlob, freshSave } from '../hooks/state'

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
function world(on: On, entries: Record<string, unknown> = {}, sid = 'S1') {
  const store = new Map<string, unknown>(Object.entries(entries).map(([k, v]) => [k, copy(v)]))
  toasts = []
  redraws = 0
  modelCalls = []
  on('store.get', async (_$, e) => ({ value: copy(store.get(e.key)) }))
  on('store.set', async (_$, e) => { store.set(e.key, copy(e.value)); return { value: undefined } })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.id', async () => ({ value: sid }))
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
    const r = await $.command.run(run('reset'))
    expect(store.get('save.bak')).toEqual(good)
    expect((store.get('save') as { version: number }).version).toBe(1)
    expect(r.text).toMatch(/save\.bak keeps the backup/)
  })

  test('reset rolls a fresh save and backs up the current one', async ($, on) => {
    const s = freshSave([1, 2, 3, 4])
    const store = world(on, { save: s })
    mock.clock(on)
    await start($)
    const r = await $.command.run(run('reset'))
    expect(r.text).toMatch(/save\.bak/)
    expect(store.get('save.bak')).toEqual(s)
    const fresh = store.get('save') as { version: number; seed: number[] }
    expect(fresh.version).toBe(1)
    expect(fresh.seed).not.toEqual(s.seed)
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

  for (const view of ['full', 'compact'] as const) {
    test(`the idle bob redraws ${view === 'full' ? 'only' : 'never'} in the ${view} view`, async ($, on) => {
      world(on, { save: { ...freshSave([1, 2, 3, 4]), view } })
      const clock = mock.clock(on, { now: NOON })
      await start($)
      await $.command.run(run('stats'))
      const ui = await $.ui.mount({
        plugin: 'pokebuddy', surface: 'terminal', component: 'AbovePrompt',
        props: { hasSurvey: false, isWorking: false, maxRows: 60, bodyColumns: 195, scroll: { offset: 0, bodyRows: 60 }, view: {} },
        viewport: { columns: 200, rows: 60 },
      })
      const before = redraws
      await clock.advance(IDLE_FRAME_MS * 3)
      if (view === 'full') expect(redraws - before >= 3).toBe(true)
      else expect(redraws - before).toBe(0)
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
