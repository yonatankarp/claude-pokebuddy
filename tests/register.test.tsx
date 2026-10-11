import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'
import { countsAsPrompt, shouldHandleTurn } from '../hooks/register'
import { COMMAND, EVOLVE_MS } from '../hooks/config'
import { species } from '../hooks/data/dex'
import { expForLevel } from '../hooks/exp'
import { exportBlob, freshSave } from '../hooks/state'

const copy = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

/**
 * What lies beneath the mod in a session, answered in memory: `$.store` (the kit's `$` has no
 * `store` noun, so the test keeps the map to read what the mod wrote), the session's start,
 * command registration and toasts.
 */
function world(on: On, entries: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(entries).map(([k, v]) => [k, copy(v)]))
  on('store.get', async (_$, e) => ({ value: copy(store.get(e.key)) }))
  on('store.set', async (_$, e) => { store.set(e.key, copy(e.value)); return { value: undefined } })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('ui.toast', async () => ({ value: undefined }))
  on('ui.invalidate', async () => ({ value: undefined }))
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
const start = ($: Engine) => $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

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

  test('a corrupt save is backed up before a fresh roll', async ($, on) => {
    const store = world(on, { save: 'garbage' })
    mock.clock(on)
    await start($)
    await $.command.run(run('stats'))
    expect(store.get('save.bak')).toBe('garbage')
    expect((store.get('save') as { version: number }).version).toBe(1)
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
    expect(after.view).toBe('full')
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

  test('slash commands and plugin prompts earn no prompt EXP', () => {
    expect(countsAsPrompt({ text: '/buddy feed', origin: { kind: 'composer' } })).toBe(false)
    expect(countsAsPrompt({ text: 'fix it', origin: { kind: 'plugin', name: 'x' } })).toBe(false)
    expect(countsAsPrompt({ text: 'fix it', origin: { kind: 'composer' } })).toBe(true)
  })

  test('only main-loop turns are handled', () => {
    expect(shouldHandleTurn({ isAborted: false })).toBe(true)
    expect(shouldHandleTurn({ agentId: 'a1', isAborted: false })).toBe(false)
  })

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
