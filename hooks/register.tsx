import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptOrigin, Register, ToolCallResult } from 'claude-code'
import { dexText, helpText, parseArgs, parseStone, statsText } from './commands'
import { COMMAND, DENIED_MAX, EVOLVE_MS, FLASH_MS, PENDING_LOG_MAX } from './config'
import { findSpecies, species } from './data/dex'
import { applyExp, applyTurn, cancelEvolution, feed, finishEvolution, useStone, type GameEvent } from './game'
import { judge, lineFacts, lineSession, tagLine } from './judge'
import { localTime, readOffset } from './localtime'
import { band, type BandView } from './render/band'
import { signalsFromTool, type Outcome } from './signals'
import { speak, turnFacts } from './speech'
import { exportBlob, freshSave, importBlob, parseSave, type Save } from './state'
import { emptyTally, scoreTally, withoutReds, type Tally } from './tally'

const saveAtom = atom({ plugin: 'pokebuddy', key: 'save' } as const, null)
const bubbleAtom = atom({ plugin: 'pokebuddy', key: 'bubble' } as const, null)
const flashAtom = atom({ plugin: 'pokebuddy', key: 'flashUntil' } as const, 0)

const WINDOW_MS = 10 * 60 * 1000
const READ_ONLY = 'Your pokebuddy save is from a newer version of the mod. Update the mod; nothing was changed.'
const CORRUPT = 'Your pokebuddy save could not be read. It was kept in save.bak. Run /buddy restore or /buddy reset confirm.'
const CORRUPT_BAK_KEPT = 'Your pokebuddy save could not be read. Your previous backup in save.bak was kept; the damaged save was left in place. Run /buddy restore or /buddy reset confirm.'

/** Why the save cannot be used this session (null when it can), and whether the person was told. */
const blocked: { reason: string | null; isToasted: boolean } = { reason: null, isToasted: false }
const blockedText = () => ({ text: blocked.reason ?? READ_ONLY })
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
    return save
  }
  if (parsed.kind === 'future') blocked.reason = READ_ONLY
  else blocked.reason = (await backUp($, raw)) ? CORRUPT : CORRUPT_BAK_KEPT
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
    if (ev.kind === 'stone') $.ui.toast(`You found a ${ev.stone.replace('-', ' ').toUpperCase()}!`)
    if (ev.kind === 'evolved') $.ui.toast(`Congratulations! ${species(ev.from).name} evolved into ${species(ev.to).name}!`)
    if (ev.kind === 'max') $.ui.toast('Level 100!')
  }
  if (events.some(e => e.kind === 'level' || e.kind === 'evolved' || e.kind === 'evolving')) {
    const now = await $.clock.now()
    await update($, flashAtom, () => now + FLASH_MS)
    $.clock.after(FLASH_MS + 50, () => $.ui.invalidate('ui.render'))
  }
  if (events.some(e => e.kind === 'evolving')) {
    $.clock.after(EVOLVE_MS, () => mutate($, s => finishEvolution(s)))
  }
}

/** The loader follows `$` only into this file, so the pure modules get a client that spells each call out. */
function clients($: EngineInterface) {
  return {
    process: { run: (...a: Parameters<EngineInterface['process']['run']>) => $.process.run(...a) },
    model: { complete: (...a: Parameters<EngineInterface['model']['complete']>) => $.model.complete(...a) },
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
  let tally: Tally = emptyTally()
  let lastWindow = -1
  let offset: number | null = null
  // Until a session.start says otherwise (a reload may not raise one), assume a person is there.
  let isInteractive = true

  on('session.start', async ($, e, next) => {
    blocked.isToasted = false
    isInteractive = e.isInteractive
    await $.command.register({ name: 'buddy', description: 'Your Gen 1 Pokémon buddy: stats, dex, feed, evolve' })
    offset = await readOffset(clients($))
    // A reload or exit inside the evolution window drops its timer; finish it now.
    const loaded = await mutate($, s => (s.evolution ? finishEvolution(s) : { save: s }))
    if (!isInteractive) return next(e)
    // Take the finished sessions' lines first, then score them, so no other session judges them again.
    // This session's own lines stay for the session after it. Quiet means no model calls: they are dropped.
    const sid = await $.session.id()
    let taken: string[] = []
    if (loaded && loaded.save.pendingLog.some(l => lineSession(l) !== sid)) {
      await mutate($, s => {
        const finished = s.pendingLog.filter(l => lineSession(l) !== sid)
        if (s.speechOn) taken = finished.map(lineFacts)
        return { save: { ...s, pendingLog: s.pendingLog.filter(l => lineSession(l) === sid) } }
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

  on('prompt.submit', async ($, e, next) => {
    if (countsAsPrompt(e)) {
      tally.prompts++
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
      tally.signals.push(...signalsFromTool(String(e.tool), e as unknown as Record<string, unknown>, outcome(ran, e.tool_use_id)))
    } catch {}
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!shouldHandleTurn(e)) return result
    const turn = e.isAborted ? withoutReds(tally) : tally
    tally = emptyTally()
    // A headless run (-p, the SDK) has no one watching: no EXP, no log line, no speech.
    if (!isInteractive) return result
    const sid = await $.session.id()
    const local = localTime(await $.clock.now(), offset)
    const facts = turnFacts(turn.signals, turn.prompts)
    const r = await mutate($, s => {
      const applied = applyTurn(s, scoreTally(turn, s.checks), local)
      return { ...applied, save: { ...applied.save, pendingLog: [...applied.save.pendingLog, tagLine(sid, facts)].slice(-PENDING_LOG_MAX) } }
    })
    if (r?.save.speechOn) {
      const save = r.save
      $.clock.after(0, async () => {
        const line = await speak(clients($), model, save, facts)
        await update($, bubbleAtom, () => line)
      })
    }
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'buddy' }, async ($, e) => {
    const { sub, rest } = parseArgs(e.args)
    if (sub === 'help') return { text: helpText(COMMAND) }
    if (sub === 'dex' && rest) {
      const s = findSpecies(rest)
      return { text: s ? dexText(s, false) : `No Gen 1 Pokémon called "${rest}".` }
    }
    const local = localTime(await $.clock.now(), offset)
    switch (sub) {
      case 'stats': {
        const s = await loadFresh($)
        if (s) await update($, saveAtom, () => s)
        return s ? { text: statsText(s) } : blockedText()
      }
      case 'dex': {
        const s = await loadFresh($)
        return s ? { text: dexText(species(s.species), true) } : blockedText()
      }
      case 'feed': {
        const r = await mutate($, s => feed(s, local))
        if (!r) return blockedText()
        const name = species(r.save.species).name
        if (!r.fed) return { text: `${name} has already eaten today. Come back tomorrow.` }
        const days = r.save.counters.feedRun
        return { text: `You fed ${name} a Rare Candy. +${r.gained} EXP. Streak: ${days} day${days === 1 ? '' : 's'}.` }
      }
      case 'use': {
        const stone = parseStone(rest)
        if (!stone) return { text: 'Which stone? moon, fire, water, thunder or leaf.' }
        let from = 0
        const r = await mutate($, s => { from = s.species; return useStone(s, stone) })
        if (!r) return blockedText()
        if (r.error) return { text: r.error }
        return { text: `${species(from).name} evolved into ${species(r.save.species).name}!` }
      }
      case 'stop': {
        const r = await mutate($, s => cancelEvolution(s))
        if (!r) return blockedText()
        return { text: r.cancelled ? `Huh? ${species(r.save.species).name} stopped evolving!` : 'Nothing is evolving right now.' }
      }
      case 'toggle': {
        const r = await mutate($, s => ({ save: { ...s, view: s.view === 'full' ? 'compact' as const : 'full' as const } }))
        return r ? { text: `Showing the ${r.save.view} view.` } : blockedText()
      }
      case 'quiet': {
        const r = await mutate($, s => ({ save: { ...s, speechOn: !s.speechOn } }))
        if (!r) return blockedText()
        if (!r.save.speechOn) await update($, bubbleAtom, () => null)
        return { text: r.save.speechOn ? 'Speech is on.' : 'Speech is off. No model calls are made: no reactions and no session judge.' }
      }
      case 'nickname': {
        const nickname = rest.trim().slice(0, 12) || null
        const r = await mutate($, s => ({ save: { ...s, nickname } }))
        if (!r) return blockedText()
        return { text: nickname ? `Nickname set to ${nickname}.` : 'Nickname cleared.' }
      }
      case 'export': {
        const s = await loadFresh($)
        if (!s) return blockedText()
        const blob = exportBlob(s)
        const copied = await $.ui.copy({ text: blob })
        return { text: copied.isCopied ? 'Save copied to the clipboard.' : `Copy this save:\n${blob}` }
      }
      case 'import': {
        const parsed = importBlob(rest)
        if (parsed.kind === 'bad') return { text: parsed.reason }
        const kept = await backUp($, await $.store.get('save'))
        await install($, parsed.save)
        return { text: `Restored ${species(parsed.save.species).name} at Lv ${parsed.save.level}.${kept ? ' Your previous save is in save.bak.' : ''}` }
      }
      case 'restore': {
        const bak = parseSave(await $.store.get('save.bak'))
        if (bak.kind !== 'ok') return { text: 'save.bak does not hold a save this version can read. Nothing was changed.' }
        const current = await $.store.get('save')
        if (current !== undefined) await $.store.set('save.bak', current as never)
        await install($, bak.save)
        return { text: `Restored ${species(bak.save.species).name} at Lv ${bak.save.level} from save.bak. The save it replaced is now in save.bak.` }
      }
      case 'reset': {
        // Read only: an unconfirmed reset writes nothing, not even the fresh roll or the backup loadFresh makes.
        const raw = await $.store.get('save')
        const cur = parseSave(raw)
        if (rest.trim().toLowerCase() !== 'confirm') {
          const what = cur.kind === 'ok' ? `${cur.save.nickname ?? species(cur.save.species).name} (Lv ${cur.save.level})` : 'the current save'
          return { text: `This rolls a new Pokémon at Lv 5 and moves ${what} to save.bak. It works once a day. Run /buddy reset confirm to go ahead.` }
        }
        if (cur.kind === 'ok' && cur.save.lastResetDate === local.date) {
          return { text: 'You already reset today. Reset works once a day; nothing was changed.' }
        }
        const kept = await backUp($, raw)
        const save = freshSave(randomSeed(), local.date)
        await install($, save)
        return { text: `A wild ${species(save.species).name} appeared at Lv ${save.level}! ${kept ? 'Your previous save is in save.bak.' : 'save.bak keeps the backup it already had.'}` }
      }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const view = await drawView($)
    if (!view) return next(e)
    return band($.ui.resolve(e), view, e.props.maxRows, e.props.bodyColumns)
  })
}
