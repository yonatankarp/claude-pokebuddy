import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptOrigin, Register, ToolCallResult } from 'claude-code'
import { runCommand, type CommandIO } from './commands'
import { DENIED_MAX, EVOLVE_MS, FLASH_MS, PENDING_LOG_MAX } from './config'
import { species } from './data/dex'
import { stoneName } from './data/types'
import { applyExp, applyTurn, finishEvolution, type GameEvent } from './game'
import { FINISHED_MAX, judge, lineSession, tagLine, takeEnded } from './judge'
import { localTime } from './localtime'
import { band, type BandView } from './render/band'
import { signalsFromTool, type Outcome } from './signals'
import { EXCERPT_MAX, speak, turnFacts } from './speech'
import { freshSave, parseSave, type Save } from './state'
import { emptyTally, scoreTally, withoutReds, type Tally } from './tally'

const saveAtom = atom({ plugin: 'pokebuddy', key: 'save' } as const, null)
const bubbleAtom = atom({ plugin: 'pokebuddy', key: 'bubble' } as const, null)
const flashAtom = atom({ plugin: 'pokebuddy', key: 'flashUntil' } as const, 0)

const WINDOW_MS = 10 * 60 * 1000
const READ_ONLY = 'Your pokebuddy save is from a newer version of the mod. Update the mod; nothing was changed.'

/** What to say about an unreadable save, offering only what can work with the backup slot as it now is. */
export function corruptAdvice(backup: ReturnType<typeof parseSave>['kind']): string {
  const head = 'Your pokebuddy save could not be read.'
  if (backup === 'ok') return `${head} The backup slot holds a good save and was kept; the damaged save was left in place. Run /buddy restore to bring the backup back, or /buddy reset confirm to start over.`
  if (backup === 'future') return `${head} The backup slot holds a save from a newer version and was kept; the damaged save was left in place. Update the mod and run /buddy restore, or run /buddy reset confirm to start over or /buddy import <export> to load an export.`
  return `${head} The damaged save is kept in the backup slot. Run /buddy reset confirm to start over, or /buddy import <export> to load an export.`
}

/** Why the save cannot be used this session (null when it can), and whether the person was told. */
const blocked: { reason: string | null; isToasted: boolean } = { reason: null, isToasted: false }
const randomSeed = () => Array.from(crypto.getRandomValues(new Uint32Array(4)))

export function shouldHandleTurn(e: { agentId?: string; isAborted: boolean }): boolean {
  return e.agentId === undefined
}

/** Only the person's own typing earns prompt EXP: at the terminal or through the Remote Control bridge. */
export function countsAsPrompt(e: { text: string; origin: PromptOrigin }): boolean {
  return (e.origin.kind === 'composer' || e.origin.kind === 'bridge') && !e.text.trimStart().startsWith('/')
}

/** Calls the permission check denied: they reach tool.call as errors, which are not failures. */
const denied = new Set<string>()
function markDenied(id: string) {
  denied.add(id)
  if (denied.size > DENIED_MAX) denied.delete(denied.values().next().value!)
}

function outcome(ran: ToolCallResult, id: string): Outcome {
  if (ran.deny !== undefined || denied.has(id)) return 'unknown'
  return ran.isError === true ? 'failed' : 'ok'
}

/**
 * Copies `raw` to save.bak, unless `raw` is unreadable and save.bak already holds something readable:
 * an earlier good backup is never replaced by a damaged save. Returns whether it wrote.
 */
async function backUp($: EngineInterface, raw: unknown): Promise<boolean> {
  if (raw === undefined) return false
  if (parseSave(raw).kind === 'corrupt') {
    const bak = parseSave(await $.store.get('save.bak')).kind
    if (bak !== 'empty' && bak !== 'corrupt') return false
  }
  await $.store.set('save.bak', raw as never)
  return true
}

/**
 * Reads the save fresh from the store; rolls one when there is none. null when it is from a newer
 * version or unreadable: nothing is written over it, and the person is told once per session.
 */
async function loadFresh($: EngineInterface): Promise<Save | null> {
  const raw = await $.store.get('save')
  const parsed = parseSave(raw)
  if (parsed.kind === 'ok') {
    blocked.reason = null
    return parsed.save
  }
  if (parsed.kind === 'empty') {
    const save = freshSave(randomSeed())
    await $.store.set('save', save)
    blocked.reason = null
    $.ui.toast(`A wild ${species(save.species).name} appeared! Type /buddy to meet it.`)
    return save
  }
  if (parsed.kind === 'future') blocked.reason = READ_ONLY
  else {
    await backUp($, raw)
    blocked.reason = corruptAdvice(parseSave(await $.store.get('save.bak')).kind)
  }
  if (!blocked.isToasted) {
    blocked.isToasted = true
    $.ui.toast(blocked.reason)
  }
  return null
}

/**
 * Puts `save` in place as the live save and lifts any read-only state. The later reset date of the
 * two saves is kept, so a restore or an import cannot lift the once-a-day reset limit.
 */
async function install($: EngineInterface, incoming: Save) {
  const cur = parseSave(await $.store.get('save'))
  const kept = cur.kind === 'ok' ? cur.save.lastResetDate : null
  const save = kept !== null && (incoming.lastResetDate === null || kept > incoming.lastResetDate) ? { ...incoming, lastResetDate: kept } : incoming
  await $.store.set('save', save)
  await update($, saveAtom, () => save)
  blocked.reason = null
  blocked.isToasted = false
  evolutionTimer.generation++
  if (save.evolution) scheduleEvolution($)
}

/** Read fresh, change, write back, refresh the drawing copy. */
async function mutate<T>($: EngineInterface, change: (s: Save) => { save: Save; events?: readonly GameEvent[] } & T): Promise<(T & { save: Save }) | null> {
  const cur = await loadFresh($)
  if (!cur) return null
  const r = change(cur)
  await $.store.set('save', r.save)
  await update($, saveAtom, () => r.save)
  if (r.events?.length) await announce($, r.events, r.save)
  return r
}

async function announce($: EngineInterface, events: readonly GameEvent[], save: Save) {
  for (const ev of events) {
    if (ev.kind === 'level') $.ui.toast(`${save.nickname ?? species(save.species).name} grew to Lv ${ev.level}!`)
    if (ev.kind === 'stone') $.ui.toast(`You found a ${stoneName(ev.stone)}!`)
    if (ev.kind === 'evolved') $.ui.toast(`Congratulations! ${species(ev.from).name} evolved into ${species(ev.to).name}!`)
    if (ev.kind === 'max') $.ui.toast('Level 100!')
  }
  if (events.some(e => e.kind === 'level' || e.kind === 'evolved' || e.kind === 'evolving')) {
    const now = await $.clock.now()
    await update($, flashAtom, () => now + FLASH_MS)
    $.clock.after(FLASH_MS + 50, () => $.ui.invalidate('ui.render'))
  }
  if (events.some(e => e.kind === 'evolving')) scheduleEvolution($)
}

/** Which evolution timer is current: a stop, a new evolution or an install makes older timers do nothing. */
const evolutionTimer = { generation: 0 }

/** Finishes the save's evolution after the window, unless it was stopped or replaced before then. */
function scheduleEvolution($: EngineInterface) {
  const generation = ++evolutionTimer.generation
  $.clock.after(EVOLVE_MS, async () => {
    if (generation === evolutionTimer.generation) await mutate($, s => finishEvolution(s))
  })
}

/** The loader follows `$` only into this file, so the pure modules get a client that spells each call out. */
function clients($: EngineInterface) {
  return {
    model: { complete: (...a: Parameters<EngineInterface['model']['complete']>) => $.model.complete(...a) },
  }
}

/** The engine calls the command handlers make, spelled out here where the loader follows `$`. */
function commandIO($: EngineInterface, isInteractive: boolean): CommandIO {
  return {
    isInteractive,
    now: () => $.clock.now(),
    load: () => loadFresh($),
    show: async save => { await update($, saveAtom, () => save) },
    mutate: change => mutate($, change),
    blockedText: () => blocked.reason ?? READ_ONLY,
    readRaw: key => $.store.get(key),
    writeRaw: (key, value) => $.store.set(key, value as never),
    backUp: raw => backUp($, raw),
    install: save => install($, save),
    quietBubble: async () => { await update($, bubbleAtom, () => null) },
    copy: async text => (await $.ui.copy({ text })).isCopied,
    evolutionStopped: () => { evolutionTimer.generation++ },
    randomSeed,
  }
}

/** What the band draws at this moment; null with no save to draw. */
async function drawView($: EngineInterface): Promise<BandView | null> {
  const save = await read($, saveAtom)
  if (!save) return null
  const isFlash = (await read($, flashAtom)) > (await $.clock.now())
  return { save, bubble: await read($, bubbleAtom), showFull: save.view === 'full' || isFlash, evolving: save.evolution !== null }
}

export const register: Register = (on, options) => {
  const model = String(options.speechModel ?? 'haiku')
  // 'facts' keeps the conversation from the speech model; the session judge only ever sees facts.
  const hearsConversation = options.speechContext !== 'facts'
  // The person's last prompt of this turn, for speech only: never stored, dropped when the turn ends.
  let turnPrompt: string | null = null
  let tally: Tally = emptyTally()
  let lastWindow = -1
  // Until a session.start says otherwise (a reload may not raise one), assume a person is there.
  let isInteractive = true

  on('session.start', async ($, e, next) => {
    blocked.isToasted = false
    isInteractive = e.isInteractive
    await $.command.register({ name: 'buddy', description: 'Your Gen 1 Pokémon buddy: stats, dex, feed, evolve' })
    // A reload or exit inside the evolution window drops its timer; finish it now.
    const loaded = await mutate($, s => (s.evolution ? finishEvolution(s) : { save: s }))
    if (!isInteractive) return next(e)
    // Take the ended sessions' lines first, then score them, so no other session judges them again.
    // A running session's lines stay, this one's included. Quiet means no model calls: they are dropped.
    const sid = await $.session.id()
    const now = await $.clock.now()
    let taken: string[] = []
    if (loaded && (loaded.save.finishedSessions.length > 0 || takeEnded(loaded.save.pendingLog, [], sid, now).taken.length > 0)) {
      await mutate($, s => {
        const ended = takeEnded(s.pendingLog, s.finishedSessions, sid, now)
        if (s.speechOn) taken = ended.taken
        return { save: { ...s, pendingLog: ended.log, finishedSessions: [] } }
      })
    }
    if (taken.length > 0) {
      $.clock.after(0, async () => {
        const score = await judge(clients($), model, taken)
        if (score === null) return
        await mutate($, s => applyExp(s, { judge: score }))
        $.ui.toast(`Last session judged ${score}/100: +${score} EXP`)
      })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Marks the ending session's lines for the next session start to judge: one store write, well inside
  // session.end's short bound, and only when this session logged a turn.
  on('session.end', async ($, e, next) => {
    if (isInteractive) {
      const cur = parseSave(await $.store.get('save'))
      if (cur.kind === 'ok' && !cur.save.finishedSessions.includes(e.sessionId) && cur.save.pendingLog.some(l => lineSession(l) === e.sessionId)) {
        await $.store.set('save', { ...cur.save, finishedSessions: [...cur.save.finishedSessions, e.sessionId].slice(-FINISHED_MAX) })
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    // Another session may have written the save since this one last did: draw what is stored.
    const stored = parseSave(await $.store.get('save'))
    if (stored.kind === 'ok') await update($, saveAtom, () => stored.save)
    if (countsAsPrompt(e)) {
      tally.prompts++
      // The turn's first prompt: one typed while the turn runs waits in the queue and is not this turn's.
      turnPrompt ??= e.text.slice(0, EXCERPT_MAX)
      const window = Math.floor((await $.clock.now()) / WINDOW_MS)
      if (window !== lastWindow) { tally.activeWindows++; lastWindow = window }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'deny' && e.tool_use_id !== undefined) markDenied(e.tool_use_id)
    return verdict
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      tally.signals.push(...signalsFromTool(String(e.tool), e as unknown as Record<string, unknown>, outcome(ran, e.tool_use_id), ran.text ?? ''))
    } catch {}
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!shouldHandleTurn(e)) return result
    const turn = e.isAborted ? withoutReds(tally) : tally
    tally = emptyTally()
    const talk = hearsConversation ? { prompt: turnPrompt, answer: e.answer.slice(0, EXCERPT_MAX) } : null
    turnPrompt = null
    // A headless run (-p, the SDK) has no one watching: no EXP, no log line, no speech.
    if (!isInteractive) return result
    const sid = await $.session.id()
    const now = await $.clock.now()
    const local = localTime(now)
    const facts = turnFacts(turn.signals, turn.prompts)
    const r = await mutate($, s => {
      const applied = applyTurn(s, scoreTally(turn, s.checks), local)
      // A session resumed under an id that had ended is running again: its lines wait for its next end.
      const finishedSessions = applied.save.finishedSessions.filter(id => id !== sid)
      return { ...applied, save: { ...applied.save, finishedSessions, pendingLog: [...applied.save.pendingLog, tagLine(sid, now, facts)].slice(-PENDING_LOG_MAX) } }
    })
    if (r?.save.speechOn) {
      const save = r.save
      $.clock.after(0, async () => {
        if (!(await read($, saveAtom))?.speechOn) return
        const line = await speak(clients($), model, save, facts, talk)
        // A /buddy quiet while the model answered wins: the line is dropped.
        if ((await read($, saveAtom))?.speechOn) await update($, bubbleAtom, () => line)
      })
    }
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'buddy' }, async ($, e) => ({ text: await runCommand(commandIO($, isInteractive), e.args) }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const view = await drawView($)
    if (!view) return next(e)
    return band($.ui.resolve(e), view, e.props.maxRows, e.props.bodyColumns, e.viewport?.isFullscreen === true)
  })
}
